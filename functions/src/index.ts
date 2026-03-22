// @ts-nocheck
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer";

export const generatePdf = onRequest({
  memory: "2GiB",
  timeoutSeconds: 120,
  cpu: 1,
  region: "asia-northeast1",
  cors: true
}, async (req, res) => {
  try {
    const { html } = req.body;
    if (!html) {
      res.status(400).send('HTMLデータがありません');
      return;
    }

    // 裏サーバーでブラウザを起動
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // ★追加：超高解像度（Retinaモード）のビューポートを設定する
    // これにより、画像の粗さが劇的に改善されます。
    await page.setViewport({
      width: 794, // A4幅 (mm) * 3.78
      height: 1123, // A4高さ (mm) * 3.78
      deviceScaleFactor: 2, // ★重要：これを2または3にすると、画像が超高画質になります
    });

    // HTMLをセット（完全に読み込まれるまで待機）
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // PDFを作成（A4サイズ）
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true // ★追加：CSSで指定されたページサイズを優先
    });

    await browser.close();

    // 完成したPDFをiPhoneに送信
    res.set('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBuffer));

  } catch (error) {
    logger.error("PDF生成エラー", error);
    res.status(500).send('PDFの生成に失敗しました');
  }
});