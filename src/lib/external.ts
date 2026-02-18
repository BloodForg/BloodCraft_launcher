export const openExternal = async (url: string) => {
  if (window.bloodcraft?.openExternal) {
    await window.bloodcraft.openExternal(url);
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
};
