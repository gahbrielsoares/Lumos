import { supabase } from "./supabaseClient.js?v=61";

// =====================================================================
// Estabelecimento atual
// O dono trabalha nos próprios dados; o funcionário (equipe), nos dados
// do patrão. Todo o painel usa getWorkspaceOwnerId() como "dono dos dados".
// =====================================================================

let cache = null;

export async function getMyAccess() {
  if (cache) return cache;
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id || null;
  let info = { member: null, owner: null };
  if (uid) {
    const { data, error } = await supabase.rpc("my_access");
    if (!error && data) info = data;
  }
  cache = { uid, member: info.member || null, owner: info.owner || null };
  return cache;
}

export async function getWorkspaceOwnerId() {
  const a = await getMyAccess();
  return a.member?.owner_id || a.uid;
}

export async function isTeamMember() {
  return !!(await getMyAccess()).member;
}
