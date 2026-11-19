// Permissive CORS helper used by legacy/general edge functions:
// - create-call
// - update-call-status
// - get-meeting-token
//
// For strict origin validation, use _shared/auth-helpers.ts:getCorsHeaders
// (currently used by ingest-patient-observation).
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-guest-token',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}
