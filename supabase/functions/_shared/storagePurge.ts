// Exclusão definitiva de arquivos: remove todos os objetos sob as pastas dadas.
// deno-lint-ignore no-explicit-any
export async function purgeStorageFolders(admin: any, bucket: string, folders: string[]) {
  for (const folder of folders) {
    const stack = [folder];
    while (stack.length) {
      const prefix = stack.pop()!;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
        if (error) throw error;
        if (!data || data.length === 0) break;
        const files: string[] = [];
        for (const item of data) {
          const path = `${prefix}/${item.name}`;
          if (item.id === null) stack.push(path); else files.push(path);
        }
        if (files.length) {
          const { error: rmError } = await admin.storage.from(bucket).remove(files);
          if (rmError) throw rmError;
        }
        if (data.length < 1000) break;
      }
    }
  }
}
