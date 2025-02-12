const puppeteer = require('puppeteer-core');
const { google } = require('googleapis');
const fs = require('fs');

// Đọc từ GitHub Secrets thay vì sử dụng tệp cục bộ
const CREDENTIALS_JSON = process.env.GOOGLE_CREDENTIALS_JSON; // Đọc từ biến môi trường
console.log(process.env.GOOGLE_CREDENTIALS_JSON);

const SPREADSHEET_ID = "1-82lpqzMehme79OH16z1_loUlZ9oZ7WvzK-vSgwROnk";
const SHEETS = {
  "Whittlewood Plank": "White Plank",
  "Craftbark Plank": "Craft Plank"
};

// Hàm xác thực Google Sheets
async function authenticateGoogleSheets() {
  try {
    // Read credentials from file
    const credentialsJson = fs.readFileSync('credentials.json', 'utf8');
    
    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
    } catch (error) {
      console.error('Failed to parse credentials:', error);
      throw error;
    }

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error('Invalid credentials format');
    }

    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/spreadsheets']
    );

    await auth.authorize();
    console.log('Authentication successful');
    return auth;
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

// Helper function để chuyển số thành chữ cái cột
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

// Hàm tính toán dòng hiện tại dựa trên thời gian
function getCurrentRow() {
  const now = new Date();
  // Đảm bảo sử dụng timezone Việt Nam
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  const hours = vnTime.getHours();
  const minutes = vnTime.getMinutes();
  
  console.log(`Thời gian hiện tại: ${hours}:${minutes}`);
  
  let minutesSince7AM = (hours * 60 + minutes) - (7 * 60);
  if (minutesSince7AM < 0) {
    minutesSince7AM += 24 * 60;
  }
  
  const row = Math.floor(minutesSince7AM / 15) + 3;
  console.log(`Dòng hiện tại: ${row}`);
  return row;
}

// Cập nhật hàm getCurrentColumn
function getCurrentColumn() {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  // Reset to start of day in Vietnam timezone
  const startDate = new Date(vnTime);
  startDate.setHours(0, 0, 0, 0);
  
  const diffDays = Math.floor((vnTime - startDate) / (1000 * 60 * 60 * 24));
  const columnNumber = diffDays + 2;
  
  console.log(`Số cột hiện tại: ${columnNumber}`);
  
  if (columnNumber > 26) {
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
    const value = result.profitPerEnergy.replace('/E', '').trim();
    const range = `${sheetName}!${column}${row}`;

    try {
      console.log(`Attempting to write to ${range}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [[value]]
        }
      });
      console.log(`Đã ghi ${value} vào ${sheetName} tại ${column}${row}`);
    } catch (error) {
      console.error(`Lỗi khi ghi vào ${sheetName}!${column}${row}:`, error.message);
    }
  }
}

// Hàm truy cập và ghi dữ liệu từ trang web
async function fetchAndLogData() {
  console.log('Bắt đầu truy cập trang web...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome-stable',  // Chỉ định đường dẫn tới Chrome
    defaultViewport: { width: 1920, height: 1080 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-dev-shm-usage' // Add this
    ]
  });
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0');
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
        waitUntil: ['networkidle0', 'domcontentloaded'],
        timeout: 90000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 8000));

      console.log('Đợi tiêu đề hiển thị...');
      await page.waitForSelector('#woodwork', {
        visible: true,
        timeout: 90000
      });

      try {
        await page.click('div.col-span-4 button');
        
        await page.evaluate(() => {
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
        });
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

      if (results.length === 0 || results.some(item => !item.profitPerEnergy)) {
        console.log('Không tìm thấy giá trị profitPerEnergy, đang thử lại...');
        await processPage(); // Gọi lại nếu không có kết quả
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

console.log('Bắt đầu quy trình...');
fetchAndLogData();
