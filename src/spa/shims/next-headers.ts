/** next/headers is server-only. Reaching it from SPA code is a bug: fail loudly at runtime. */
function serverOnly(name: string): never {
  throw new Error(`next/headers.${name}() is server-only and was reached from the SPA bundle`);
}
export const headers = () => serverOnly("headers");
export const cookies = () => serverOnly("cookies");
export const draftMode = () => serverOnly("draftMode");
