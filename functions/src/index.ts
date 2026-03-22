// @ts-nocheck
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer";

// 🚀 Googleのサーバーに「最強の印刷工場」を建てる設定
export const generatePdf = onRequest({
  memory: "2GiB",
  timeoutSeconds: 120,
  cpu: 1,
  region: "asia-northeast1",
  cors: true // ★これだけでiPhoneとの通信許可が完了します！
}, async (req, res) => { // ★asyncを忘れずに！
  try {
    const { html } = req.body;
    if (!html) {
      res.status(400).send('HTMLデータがありません');
      return;
    }

    // 裏サーバーでブラウザを起動
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    // HTMLをセット（写真などの読み込みが終わるまで待機）
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // PDFを作成（A4サイズ）
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
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