import imageCompression from 'browser-image-compression';

/**
 * 写真・画像を最大1MB / 1920px に圧縮する。
 * 圧縮失敗時は元ファイルをそのまま返す。
 */
export const compressPhotoWithQuality = async (file: File): Promise<File> => {
  const options = {
    maxSizeMB: 1,
    maxWidthOrHeight: 1920,
    useWebWorker: true,
    fileType: 'image/jpeg',
    initialQuality: 0.8,
  };
  try {
    return await imageCompression(file, options);
  } catch (error) {
    import.meta.env.DEV && console.warn('画像の圧縮に失敗しました。元のファイルで続行します。', error);
    return file;
  }
};
