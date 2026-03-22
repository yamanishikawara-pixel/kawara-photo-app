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

    // ★ここが最大の修正ポイント！純粋なバイナリデータとして強制送信
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="report.pdf"');
    res.end(Buffer.from(pdfBuffer));

  } catch (error) {
    logger.error("PDF生成エラー", error);
    res.status(500).send('PDFの生成に失敗しました');
  }
});