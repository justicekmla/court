// Password verifiers are kept in the authenticated project state, never in public source.
export function validChiefVerifier(v) {
  return !!v && v.algorithm==='PBKDF2-SHA256' && v.iterations===310000 && /^[0-9a-f]{48}$/.test(v.salt||'') && /^[0-9a-f]{64}$/.test(v.digest||'');
}
export function parseChiefSetup(hash) {
  try {const value=new URLSearchParams(String(hash).replace(/^#/,'' )).get('chief-setup');if(!value)return null;const config=JSON.parse(atob(value));return validChiefVerifier(config)?config:null;}catch{return null;}
}
export async function verifyChiefPassword(password, verifier) {
  if (typeof password!=='string' || !password || !validChiefVerifier(verifier)) return false;
  const salt=Uint8Array.from(verifier.salt.match(/../g),x=>parseInt(x,16));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const result=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:verifier.iterations},key,256));
  const expected=Uint8Array.from(verifier.digest.match(/../g),x=>parseInt(x,16));
  let diff=0;for(let i=0;i<result.length;i++)diff|=result[i]^expected[i];return diff===0;
}
