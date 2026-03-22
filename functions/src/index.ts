// @ts-nocheck
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer";
// ★最強のフリーパス（CORS）を手動で読み込む
const cors = require('cors')({ origin: true });

export const generatePdf = onRequest({
  memory: "2GiB",
  timeoutSeconds: 120,
  cpu: 1,
  region: "asia-northeast1"
}, (req, res) => {
  // ★工場に入る前に、必ずフリーパスを通す！
  return cors(req, res, async () => {
    try {
      const { html } = req.body;
      if (!html) {
        res.status(400).send('HTMLデータがありません');
        return;
      }

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        preferCSSPageSize: true
      });

      await browser.close();

      // PDFを「文字」に変換して安全に送る
      const base64Pdf = Buffer.from(pdfBuffer).toString('base64');
      res.status(200).json({ pdfBase64: base64Pdf });

    } catch (error) {
      logger.error("PDF生成エラー", error);
      res.status(500).send('PDFの生成に失敗しました');
    }
  });
});