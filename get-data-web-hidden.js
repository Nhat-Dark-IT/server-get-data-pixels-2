const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const fs = require('fs');

const SPREADSHEET_ID = "1-82lpqzMehme79OH16z1_loUlZ9oZ7WvzK-vSgwROnk";
const SHEETS = {
  "Whittlewood Plank": "White Plank",
  "Craftbark Plank": "Craft Plank"
};
const CREDENTIALS_PATH = 'C:\\Users\\admin\\Music\\wired-coder-445807-i3-46f706248849.json';

// Add this function after the constants and before other functions
async function authenticateGoogleSheets() {
  try {
    // Read credentials file
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    
    // Create JWT client
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    // Authenticate
    await auth.authorize();
    console.log('Google Sheets authentication successful');
    return auth;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Helper function to convert number to column letter
function getColumnLetter(columnNumber) {
  let dividend = columnNumber;
  let columnName = '';
  let modulo;

  while (dividend > 0) {
    modulo = (dividend - 1) % 26;
    columnName = String.fromCharCode(65 + modulo) + columnName;
    dividend = Math.floor((dividend - 1) / 26);
  }

  return columnName;
}

// Calculate current row based on time
function getCurrentRow() {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  
  // Convert time to minutes since 7:00 AM
  let minutesSince7AM = (hours * 60 + minutes) - (7 * 60);
  if (minutesSince7AM < 0) {
    minutesSince7AM += 24 * 60; // Add 24 hours if before 7 AM
  }
  
  // Calculate row number (3-98)
  return Math.floor(minutesSince7AM / 15) + 3;
}

// Modify getCurrentColumn function
function getCurrentColumn() {
  const startDate = new Date(); // Start from today
  startDate.setHours(0, 0, 0, 0); // Reset to start of day
  
  const today = new Date();
  const diffDays = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
  
  // Start from column B (2nd column)
  const columnNumber = diffDays + 2;
  
  // Check if exceeding column limit
  if (columnNumber > 26) {
    console.warn('Warning: Exceeding column limit, wrapping to start');
    return getColumnLetter((columnNumber - 1) % 26 + 1);
  }
  
  return getColumnLetter(columnNumber);
}

// Hàm ghi dữ liệu vào Google Sheets
async function writeToSheets(auth, results) {
  const sheets = google.sheets({ version: 'v4', auth });
  const column = getCurrentColumn();
  const row = getCurrentRow();

  if (row > 98) {
    console.error('Row number exceeds limit');
    return;
  }

  for (const result of results) {
    const sheetName = SHEETS[result.itemName];
    // Sửa xử lý giá trị
    const value = result.profitPerEnergy
      .replace('/E', '') // Xóa /E
      .trim() // Xóa khoảng trắng
      .replace("'", '') // Xóa dấu ' nếu có
      .replace(/^\s*['"]?|['"]?\s*$/g, ''); // Xóa dấu quote và khoảng trắng ở đầu/cuối
    
    const range = `${sheetName}!${column}${row}`;

    try {
      console.log(`Attempting to write to ${range}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [[Number(value)]] // Chuyển đổi sang số
        }
      });
      console.log(`Đã ghi ${value} vào ${sheetName} tại ${column}${row}`);
    } catch (error) {
      console.error(`Lỗi khi ghi vào ${sheetName}!${column}${row}:`, error.message);
    }
  }
}

async function fetchAndLogData() {
  console.log('Bắt đầu truy cập trang web...');
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1920, height: 1080 }, // Thêm viewport
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  const page = await browser.newPage();
  
  // Thêm các configurations cho page
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (['image', 'stylesheet', 'font'].indexOf(request.resourceType()) !== -1) {
      request.abort();
    } else {
      request.continue();
    }
  });

  async function processPage() {
    try {
      await page.goto('https://www.pixels.tips/crafting', { 
        waitUntil: 'networkidle0',
        timeout: 90000 // Tăng timeout
      });
      
      await new Promise(resolve => setTimeout(resolve, 8000)); // Tăng thời gian chờ

      console.log('Đợi tiêu đề hiển thị...');
      await page.waitForSelector(
        '#woodwork > section > div.flex.items-center.mt-2.sm\\:mt-0.mb-2.px-3.gap-3 > div:nth-child(2) > h2', 
        { 
          visible: true,
          timeout: 60000 // Tăng timeout
        }
      );
   
      try {
        await page.click('div.col-span-4 button');
        
        await page.evaluate(() => {
          function waitForElement(selector, timeout = 10000) {
            return new Promise((resolve, reject) => {
              const start = Date.now();
              const interval = setInterval(() => {
                const element = document.querySelector(selector);
                if (element) {
                  clearInterval(interval);
                  resolve(element);
                } else if (Date.now() - start >= timeout) {
                  clearInterval(interval);
                  reject(new Error(`Hết thời gian chờ element: ${selector}`));
                }
              }, 100);
            });
          }
      
          function setValueToElement(selector, value) {
            const element = document.querySelector(selector);
            if (element) {
              element.value = value;
              element.dispatchEvent(new Event('input', { bubbles: true }));
            }
          }
      
          setInterval(() => {
            setValueToElement("#marketplace-fee-input", "19");
          }, 1000);
      
          return waitForElement("div.transform-gpu h2");
        });
      
        console.log('Đã thiết lập giá trị input thành công');
      
      } catch (error) {
        console.error('Lỗi:', error);
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const results = await page.evaluate(() => {
        const targetItems = ["Whittlewood Plank", "Craftbark Plank"];
        const items = [];
        const seenItems = new Set();
        
        document.querySelectorAll('tr').forEach(row => {
          const nameCell = row.querySelector('[data-key="itemId"]');
          const profitCell = row.querySelector('[data-key="profitPerEnergy"]');
          
          if (nameCell && profitCell) {
            const name = nameCell.textContent.trim();
            const profit = profitCell.textContent.trim();
            
            if (targetItems.includes(name) && !seenItems.has(name) && profit) {
              seenItems.add(name);
              items.push({
                itemName: name,
                profitPerEnergy: profit
              });
            }
          }
        });
        
        return items;
      });

      // Kiểm tra kết quả
      if (results.length === 0 || results.some(item => !item.profitPerEnergy)) {
        console.log('Không tìm thấy giá trị profitPerEnergy, đang thử lại...');
        await processPage(); // Gọi đệ quy để thử lại
        return;
      }

      console.log('Tìm thấy:', results);
      
      if (results.length > 0) {
        const auth = await authenticateGoogleSheets();
        await writeToSheets(auth, results);
      }
      
    } catch (error) {
      console.error('Lỗi:', error);
      await processPage(); // Thử lại nếu có lỗi
    }
  }

  try {
    await processPage();
  } finally {
    await browser.close();
  }
}

function createTrigger() {
  console.log('Tạo trigger chạy mỗi 15 phút...');
  setInterval(fetchAndLogData, 15 * 60 * 1000);
  console.log('Đã tạo trigger thành công!');
}

console.log('Bắt đầu quy trình...');
fetchAndLogData();
createTrigger();