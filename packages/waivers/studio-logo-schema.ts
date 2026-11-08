export function isMissingStudioLogoTable(error:unknown):boolean{
 const cause=error instanceof Error&&error.cause?error.cause:error;
 return Boolean(cause&&typeof cause==='object'&&'code' in cause&&cause.code==='42P01'&&'message' in cause&&typeof cause.message==='string'&&cause.message.includes('studio_logo_assets'));
}
