// Recebe apenas pastas derivadas de registros autorizados pelo servidor.
// Não está ligado à exclusão de contas: aguarda a fila durável de limpeza no banco.
interface StorageObject { id: string | null; name: string }
interface StorageBucket {
  list(prefix: string, options: { limit: number; offset: number }): Promise<{ data: StorageObject[] | null; error: unknown }>;
  remove(paths: string[]): Promise<{ error: unknown }>;
}
interface StorageAdmin { storage: { from(bucket: string): StorageBucket } }

export async function purgeStorageFolders(admin: StorageAdmin, bucket: string, folders: string[]) {
  for (const folder of folders) {
    if (!folder || folder.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error('Pasta inválida para exclusão');
    }
    const stack = [folder];
    while (stack.length) {
      const prefix = stack.pop();
      if (prefix === undefined) continue;
      const files: string[] = [];
      // Primeiro enumera tudo: apagar durante a paginação saltaria a próxima página.
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000, offset });
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const item of data) {
          const path = `${prefix}/${item.name}`;
          if (item.id === null) stack.push(path); else files.push(path);
        }
        if (data.length < 1000) break;
      }
      for (let offset = 0; offset < files.length; offset += 100) {
        const { error: rmError } = await admin.storage.from(bucket).remove(files.slice(offset, offset + 100));
        if (rmError) throw rmError;
      }
    }
  }
}
