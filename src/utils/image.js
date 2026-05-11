import { supabase } from '../lib/supabase'

export const processPdf = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res({ b64: r.result.split(",")[1], mediaType: 'application/pdf' });
  r.onerror = rej;
  r.readAsDataURL(f);
});

export const fileToBase64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload  = () => res({ b64: r.result.split(",")[1], mediaType: f.type || "image/jpeg" });
  r.onerror = rej;
  r.readAsDataURL(f);
});

// payload is either { text } or { b64, mediaType }
export const extractInvoice = async (payload, suppliers) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No active session — please sign in again');
  const res = await fetch("/api/extract", {
    method:  "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ ...payload }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
};
