// ============================================================================
// 画像圧縮ユーティリティ
// ----------------------------------------------------------------------------
// PhotoPage / MaterialPage / BeforeAfterPage 共通の圧縮処理。
// browser-image-compression によるスマホ撮影写真の圧縮 (1MB / 1920px JPEG)。
// 圧縮失敗時は元ファイルをそのまま返す(アップロードはブロックしない)。
// ============================================================================

import imageCompression from 'browser-image-compression';

const DEFAULT_OPTIONS = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1920,
  useWebWorker: true,
  fileType: 'image/jpeg',
  initialQuality: 0.8,
};

/**
 * 画像を圧縮する。失敗時は元ファイルを返す。
 *
 * @param file 入力 File
 * @param options 圧縮オプション(未指定なら DEFAULT_OPTIONS)
 */
export const compressPhotoWithQuality = async (
  file: File,
  options = DEFAULT_OPTIONS,
): Promise<File> => {
  try {
    return await imageCompression(file, options);
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('画像の圧縮に失敗しました。元のファイルで続行します。', error);
    }
    return file;
  }
};
