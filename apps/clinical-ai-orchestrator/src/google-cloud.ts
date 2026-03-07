import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';

interface GoogleServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value).toString('base64url');
}

function normalizePrivateKey(privateKey: string): string {
  return privateKey.replace(/\\n/g, '\n');
}

async function loadGoogleServiceAccount(args: {
  inlineJson?: string;
  jsonPath?: string;
}): Promise<GoogleServiceAccount | null> {
  const rawJson =
    args.inlineJson ||
    (args.jsonPath ? await readFile(args.jsonPath, 'utf8') : undefined);

  if (!rawJson) {
    return null;
  }

  const parsed = JSON.parse(rawJson) as Partial<GoogleServiceAccount>;
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error('Invalid Google service account JSON');
  }

  return {
    client_email: parsed.client_email,
    private_key: normalizePrivateKey(parsed.private_key),
    token_uri: parsed.token_uri || 'https://oauth2.googleapis.com/token',
  };
}

export class GoogleCloudAuthClient {
  private accessToken?: string;
  private accessTokenExpiresAtMs = 0;

  constructor(private readonly serviceAccount: GoogleServiceAccount) {}

  static async fromConfig(args: {
    inlineJson?: string;
    jsonPath?: string;
  }): Promise<GoogleCloudAuthClient | null> {
    const serviceAccount = await loadGoogleServiceAccount(args);
    if (!serviceAccount) {
      return null;
    }

    return new GoogleCloudAuthClient(serviceAccount);
  }

  async getAccessToken(scope = 'https://www.googleapis.com/auth/cloud-platform'): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAtMs - 60_000) {
      return this.accessToken;
    }

    const tokenUri = this.serviceAccount.token_uri || 'https://oauth2.googleapis.com/token';
    const issuedAt = Math.floor(now / 1000);
    const expiresAt = issuedAt + 3600;

    const jwtHeader = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const jwtClaimSet = base64UrlEncode(
      JSON.stringify({
        iss: this.serviceAccount.client_email,
        scope,
        aud: tokenUri,
        exp: expiresAt,
        iat: issuedAt,
      })
    );

    const signer = createSign('RSA-SHA256');
    signer.update(`${jwtHeader}.${jwtClaimSet}`);
    signer.end();
    const signature = signer.sign(this.serviceAccount.private_key).toString('base64url');
    const assertion = `${jwtHeader}.${jwtClaimSet}.${signature}`;

    const response = await fetch(tokenUri, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });

    if (!response.ok) {
      throw new Error(`Google OAuth token request failed with status ${response.status}`);
    }

    const tokenResponse = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (!tokenResponse.access_token) {
      throw new Error('Google OAuth token response did not include access_token');
    }

    this.accessToken = tokenResponse.access_token;
    this.accessTokenExpiresAtMs = now + (tokenResponse.expires_in || 3600) * 1000;
    return this.accessToken;
  }
}

export class GoogleCloudStorageClient {
  constructor(private readonly authClient: GoogleCloudAuthClient) {}

  async uploadObject(args: {
    bucket: string;
    objectName: string;
    contentType: string;
    bytes: Buffer;
  }): Promise<{ gcsUri: string }> {
    const accessToken = await this.authClient.getAccessToken();
    const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${args.bucket}/o`);
    uploadUrl.searchParams.set('uploadType', 'media');
    uploadUrl.searchParams.set('name', args.objectName);

    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': args.contentType,
      },
      body: args.bytes,
    });

    if (!response.ok) {
      throw new Error(`GCS upload failed with status ${response.status}`);
    }

    return {
      gcsUri: `gs://${args.bucket}/${args.objectName}`,
    };
  }
}

export class GoogleSpeechToTextClient {
  constructor(private readonly authClient: GoogleCloudAuthClient) {}

  async batchRecognize(args: {
    projectId: string;
    location: string;
    recognizer: string;
    audioUri: string;
    languageCode: string;
    model: string;
    diarizationEnabled: boolean;
    multiChannelEnabled: boolean;
  }): Promise<{ operationName: string }> {
    const accessToken = await this.authClient.getAccessToken();
    const recognizerPath = encodeURIComponent(args.recognizer);
    const response = await fetch(
      `https://speech.googleapis.com/v2/projects/${args.projectId}/locations/${args.location}/recognizers/${recognizerPath}:batchRecognize`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          files: [
            {
              uri: args.audioUri,
            },
          ],
          config: {
            autoDecodingConfig: {},
            languageCodes: [args.languageCode],
            model: args.model,
            features: {
              enableAutomaticPunctuation: true,
              enableWordTimeOffsets: true,
              ...(args.diarizationEnabled ? { diarizationConfig: {} } : {}),
              ...(args.multiChannelEnabled
                ? { multiChannelMode: 'SEPARATE_RECOGNITION_PER_CHANNEL' }
                : {}),
            },
          },
          recognitionOutputConfig: {
            inlineResponseConfig: {},
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Speech-to-Text batchRecognize failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { name?: string };
    if (!payload.name) {
      throw new Error('Speech-to-Text response did not include operation name');
    }

    return {
      operationName: payload.name,
    };
  }

  async getOperation(operationName: string): Promise<Record<string, unknown>> {
    const accessToken = await this.authClient.getAccessToken();
    const encodedName = operationName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');

    const response = await fetch(`https://speech.googleapis.com/v2/${encodedName}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Speech-to-Text getOperation failed with status ${response.status}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }
}
