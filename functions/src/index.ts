// @ts-nocheck
import * as functions from 'firebase-functions';
import * as corsLib from 'cors';
import puppeteer from 'puppeteer';

const cors = corsLib({ origin: true });

export const generatePdf = functions
  .runWith({ memory: '2GB', timeoutSeconds: 120 })
  .https.onRequest((request, response) => {
    cors(request, response, async () => {
      try {
        const { html } = request.body;
        if (!html) {
          response.status(400).send('HTMLデータがありません');
          return;
        }

        const browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'], 
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        });

        await browser.close();

        response.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="report.pdf"',
        });
        
        // 安全に送信するための Buffer 変換
        response.send(Buffer.from(pdfBuffer));
        
      } catch (error) {
        console.error('PDF生成エラー:', error);
        response.status(500).send('PDFの生成に失敗しました');
      }
    });
  });