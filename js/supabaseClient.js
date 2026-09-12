// ===== Configuração do Supabase =====
// Preencha com os dados do SEU projeto (Supabase > Project Settings > API).
// A "anon key" é pública por design — pode ficar aqui no código do frontend.
// NUNCA coloque a "service_role key" em nenhum arquivo deste repositório.

const SUPABASE_URL = "https://nkmyunxjoeqpmwolefbj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rbXl1bnhqb2VxcG13b2xlZmJqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzA0ODcsImV4cCI6MjEwNDgwNjQ4N30.al8MlVXdxIEKVixhm65k5TraKq7f2mntUjVWDavbxU8";

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
