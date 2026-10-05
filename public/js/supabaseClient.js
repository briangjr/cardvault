// ---------------------------------------------------------------------------
// Thin wrapper around the Supabase client: storage uploads + table CRUD for
// the "cards" table. See supabase/schema.sql for the table/bucket definition.
// ---------------------------------------------------------------------------
const CardDB = (() => {
  const cfg = window.CARD_VAULT_CONFIG;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
  const BUCKET = cfg.STORAGE_BUCKET;

  function slugId() {
    return (
      Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9)
    );
  }

  async function uploadImage(file, folder) {
    if (!file) return null;
    const ext = (file.name && file.name.split(".").pop()) || "jpg";
    const path = `${folder}/${slugId()}.${ext}`;
    const { error } = await client.storage.from(BUCKET).upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: file.type || "image/jpeg",
    });
    if (error) throw error;
    const { data } = client.storage.from(BUCKET).getPublicUrl(path);
    return data.publicUrl;
  }

  async function uploadEdgeImages(files) {
    const urls = [];
    for (const f of files) {
      urls.push(await uploadImage(f, "edges"));
    }
    return urls;
  }

  async function insertCard(record) {
    const { data, error } = await client
      .from("cards")
      .insert(record)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateCard(id, fields) {
    const { data, error } = await client
      .from("cards")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteCard(id) {
    const { error } = await client.from("cards").delete().eq("id", id);
    if (error) throw error;
  }

  async function listCards() {
    const { data, error } = await client
      .from("cards")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  return { uploadImage, uploadEdgeImages, insertCard, updateCard, deleteCard, listCards };
})();
