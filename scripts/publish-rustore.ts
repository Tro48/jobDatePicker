import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

/**
 * Отправка собранного APK в RuStore.
 *
 * Первую версию приложения загружают в магазин руками — только после неё
 * RuStore принимает версии через API. Дальше путь такой: получить токен
 * (RSA-подпись из id ключа и метки времени), создать черновик версии, залить
 * APK и отправить черновик на модерацию. После модерации версия либо
 * публикуется сама (publishType INSTANTLY), либо ждёт кнопки в консоли
 * (MANUAL).
 *
 * Запуск: node --experimental-strip-types scripts/publish-rustore.ts
 *
 * Переменные окружения:
 *   RUSTORE_KEY_ID       — id ключа из консоли RuStore (обязательно)
 *   RUSTORE_PRIVATE_KEY  — приватный ключ из консоли: base64 или PEM (обязательно)
 *   APK_PATH             — путь к APK (обязательно)
 *   WHATS_NEW            — «Что нового» в магазине (необязательно)
 *   PUBLISH_TYPE         — MANUAL | INSTANTLY | DELAYED (по умолчанию MANUAL)
 *   PACKAGE_NAME         — имя пакета (по умолчанию com.trofimdev.jobdatepicker)
 *   APP_NAME             — имя приложения в магазине (по умолчанию «Смены»)
 *   PRIORITY_UPDATE      — приоритет обновления 0–5 (по умолчанию 0)
 *
 * Подписи, пакет и версия обязаны совпадать с уже опубликованной версией:
 * APK собирается тем же ключом, а versionCode поднимает CI перед сборкой.
 */

const API = 'https://public-api.rustore.ru';

const PACKAGE_NAME = process.env.PACKAGE_NAME ?? 'com.trofimdev.jobdatepicker';
const APP_NAME = process.env.APP_NAME ?? 'Смены';

interface RustoreAnswer<T> {
  code: string;
  message?: string | null;
  body: T;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная ${name}`);
  return value;
}

/**
 * Приватный ключ из консоли приходит одной строкой base64. PEM поддержан на
 * случай, когда ключ положили в секрет файлом — оба варианта означают одно и
 * то же, и разбирать это здесь дешевле, чем объяснять в инструкции.
 */
function privateKeyFrom(raw: string) {
  if (raw.includes('BEGIN')) return createPrivateKey(raw);

  const decoded = Buffer.from(raw, 'base64');
  try {
    return createPrivateKey(decoded);
  } catch {
    return createPrivateKey({ key: decoded, format: 'der', type: 'pkcs8' });
  }
}

async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { 'Public-Token': token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await response.text();
  let answer: RustoreAnswer<T>;
  try {
    answer = JSON.parse(text) as RustoreAnswer<T>;
  } catch {
    throw new Error(
      `RuStore ${path}: HTTP ${response.status}, ответ не JSON: ${text.slice(0, 300)}`,
    );
  }

  if (!response.ok || answer.code !== 'OK') {
    throw new Error(`RuStore ${path}: HTTP ${response.status}, ${answer.code}: ${answer.message}`);
  }
  return answer.body;
}

/** Токен доступа: подпись строки «id ключа + время» приватным ключом. */
async function getToken(keyId: string, privateKey: ReturnType<typeof createPrivateKey>) {
  const timestamp = new Date().toISOString();
  const signature = sign('RSA-SHA512', Buffer.from(keyId + timestamp), privateKey).toString(
    'base64',
  );
  const body = await postJson<{ jwe: string }>('/public/auth/', { keyId, timestamp, signature });
  return body.jwe;
}

/** Черновик версии. Ответ бывает и числом, и объектом — разбираем оба вида. */
async function createDraft(token: string, publishType: string, whatsNew: string) {
  const body = await postJson<number | { versionId?: number; id?: number }>(
    `/public/v1/application/${PACKAGE_NAME}/version`,
    { appName: APP_NAME, appType: 'MAIN', publishType, whatsNew },
    token,
  );

  const versionId = typeof body === 'number' ? body : (body.versionId ?? body.id);
  if (!versionId) throw new Error(`RuStore: в ответе нет id версии: ${JSON.stringify(body)}`);
  return versionId;
}

async function uploadApk(token: string, versionId: number, apkPath: string) {
  const apk = readFileSync(apkPath);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(apk)]), 'app.apk');

  const path = `/public/v1/application/${PACKAGE_NAME}/version/${versionId}/apk`;
  const response = await fetch(`${API}${path}?servicesType=Unknown&isMainApk=true`, {
    method: 'POST',
    headers: { 'Public-Token': token },
    body: form,
  });

  const text = await response.text();
  if (!response.ok || !text.includes('"OK"')) {
    throw new Error(`RuStore ${path}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const keyId = required('RUSTORE_KEY_ID');
  const privateKey = privateKeyFrom(required('RUSTORE_PRIVATE_KEY'));
  const apkPath = required('APK_PATH');

  const publishType = process.env.PUBLISH_TYPE ?? 'MANUAL';
  const whatsNew = process.env.WHATS_NEW?.trim() || 'Исправления и улучшения';
  const priorityUpdate = Number(process.env.PRIORITY_UPDATE ?? 0);

  const token = await getToken(keyId, privateKey);
  console.log('RuStore: токен получен');

  const versionId = await createDraft(token, publishType, whatsNew);
  console.log(`RuStore: черновик версии ${versionId} создан`);

  await uploadApk(token, versionId, apkPath);
  console.log(`RuStore: APK загружен (${apkPath})`);

  await postJson(
    `/public/v1/application/${PACKAGE_NAME}/version/${versionId}/commit?priorityUpdate=${priorityUpdate}`,
    undefined,
    token,
  );
  console.log(
    publishType === 'INSTANTLY'
      ? `RuStore: версия ${versionId} на модерации, после неё опубликуется сама`
      : `RuStore: версия ${versionId} на модерации, публикация — вручную в консоли`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
