// @ts-nocheck
import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

export const generatePdf = onRequest(
  {
    memory: "2GiB",
    timeoutSeconds: 120,
    cpu: 1,
    region: "asia-northeast1",
    cors: [
      "https://kawara-photo-app.web.app",
      "https://kawara-photo-app.firebaseapp.com",
      "http://localhost:5173"
    ]
  },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    let browser: puppeteer.Browser | null = null;

    try {
      const { html } = req.body ?? {};

      if (!html) {
        res.status(400).send("HTMLデータがありません");
        return;
      }

      browser = await puppeteer.launch({
        args: puppeteer.defaultArgs({
          args: chromium.args,
          headless: "shell"
        }),
        executablePath: await chromium.executablePath(),
        headless: "shell",
        defaultViewport: {
          width: 794,
          height: 1123,
          deviceScaleFactor: 2,
          isMobile: false,
          hasTouch: false,
          isLandscape: false
        }
      });

      const page = await browser.newPage();

      await page.setContent(html, {
        waitUntil: "networkidle0"
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true
      });

      await browser.close();
      browser = null;

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", 'attachment; filename="report.pdf"');
      res.setHeader("Cache-Control", "no-store");
      res.status(200).send(Buffer.from(pdfBuffer));
    } catch (error: any) {
      logger.error("PDF生成エラー詳細", {
        message: error?.message ?? String(error),
        name: error?.name ?? "",
        stack: error?.stack ?? ""
      });

      if (browser) {
        try {
          await browser.close();
        } catch {}
      }

      res
        .status(500)
        .send(`PDFの生成に失敗しました: ${error?.message ?? "unknown error"}`);
    }
  }
);