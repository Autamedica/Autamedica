import type { APIRoute } from 'astro'
import { apiKeyHasScope, withApiKey } from '@/lib/api-auth'
import { badRequest, forbidden, jsonOk } from '@/lib/api-helpers'

const DEFAULT_SCOPE = 'openclaw:send'

type AuthorizeBody = {
  scope?: string
}

export const POST: APIRoute = async ({ request, locals }) => {
  const apiKey = await withApiKey(request, locals)
  if (apiKey instanceof Response) return apiKey
  if (!apiKey) return badRequest('missing X-API-Key')

  let body: AuthorizeBody = {}
  const rawBody = await request.text()
  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as AuthorizeBody
    } catch {
      return badRequest('invalid JSON body')
    }
  }

  const scope = body.scope || DEFAULT_SCOPE
  if (!apiKeyHasScope(apiKey, scope)) {
    return forbidden(`missing scope: ${scope}`)
  }

  return jsonOk({
    authorized: true,
    apiKeyId: apiKey.apiKeyId,
    keyPrefix: apiKey.keyPrefix,
    belongsTo: apiKey.belongsTo,
    scope,
  })
}
