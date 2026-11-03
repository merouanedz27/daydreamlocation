/**
 * Remet un fichier à la feuille de partage du téléphone — l'appli de
 * l'imprimante d'étiquettes (4BARCODE), WhatsApp, « Imprimer » sur iPhone.
 * Sur ordinateur, ou sans partage de fichiers, il se télécharge.
 */
export async function shareFile(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: file.name });
    } catch {
      // Feuille fermée sans choisir : rien à faire.
    }
    return;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
