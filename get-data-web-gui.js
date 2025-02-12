const puppeteer = require('puppeteer');
const { google } = require('googleapis');
const fs = require('fs');

const SPREADSHEET_ID = "1-82lpqzMehme79OH16z1_loUlZ9oZ7WvzK-vSgwROnk";
const SHEETS = {
  "Popberry": "Popberry",
  "Grainbow": "Grainbow",
  "Blue Grumpkin": "Blue Grumpkin"
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

// Hàm xác định cột hiện tại
// Hàm xác định cột hiện tại với chu kỳ hàng tháng
// Hàm xác định cột hiện tại theo ngày trong tháng
function getCurrentColumn() {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  // Lấy ngày trong tháng (1-31)
  const dayOfMonth = vnTime.getDate();
  
  // Chuyển ngày thành số cột (ngày 1 = cột B = 2)
  const columnNumber = dayOfMonth + 1; // +1 vì cột B bắt đầu từ 2
  
  console.log(`=== Debug thông tin cột ===`);
  console.log(`Ngày trong tháng: ${dayOfMonth}`);
  console.log(`Tháng: ${vnTime.getMonth() + 1}`);
  console.log(`Năm: ${vnTime.getFullYear()}`);
  console.log(`Số thứ tự cột: ${columnNumber}`);
  
  // Kiểm tra giới hạn cột (B-AF)
  if (columnNumber < 2 || columnNumber > 32) {
    console.error(`Cột ${columnNumber} nằm ngoài khoảng cho phép (2-32)`);
    return null;
  }
  
  return getColumnLetter(columnNumber);
}

// Hàm ghi ngày tháng năm vào hàng 1
async function writeDateHeader(sheets, column) {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  // Format: MM/DD/YYYY
  const dateHeader = vnTime.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
  
  // Ghi vào hàng 1 của mỗi sheet
  for (const sheetName of Object.values(SHEETS)) {
    const range = `${sheetName}!${column}1`;
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: range,
        valueInputOption: 'RAW',
        resource: {
          values: [[dateHeader]]
        }
      });
      console.log(`Đã ghi ngày ${dateHeader} vào ${range}`);
    } catch (error) {
      console.error(`Lỗi khi ghi tiêu đề ngày tháng vào ${range}:`, error.message);
    }
  }
}

// Hàm xác định dòng hiện tại
function getCurrentRow() {
  const now = new Date();
  const vnTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
  
  const hours = vnTime.getHours();
  const minutes = vnTime.getMinutes();
  
  // Map trực tiếp với index của mảng thời gian (0:00 -> 23:45)
  const row = (hours * 4) + Math.floor(minutes / 15) + 3;
  
  // Format thời gian để log
  const timeString = `${hours.toString().padStart(2, '0')}:${(Math.floor(minutes/15)*15).toString().padStart(2, '0')}:00`;
  
  console.log(`=== Thông tin thời gian ===`);
  console.log(`Thời gian hiện tại: ${timeString}`);
  console.log(`Dòng tương ứng: ${row}`);
  
  // Kiểm tra giới hạn dòng
  if (row < 3 || row > 98) {
    console.error(`Dòng ${row} nằm ngoài khoảng cho phép (3-98)`);
    return null;
  }
  
  return row;
}

// Hàm ghi dữ liệu vào sheets
async function writeToSheets(auth, results) {
  const sheets = google.sheets({ version: 'v4', auth });
  const column = getCurrentColumn();
  const row = getCurrentRow();
  
  if (!column || !row) {
    console.error('Vị trí cột hoặc dòng không hợp lệ');
    return;
  }

  console.log(`=== Thông tin ghi dữ liệu ===`);
  console.log(`Vị trí ghi: Cột ${column}, Dòng ${row}`);
  
  // Ghi tiêu đề ngày tháng trước
  await writeDateHeader(sheets, column);

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
    headless: false,
    defaultViewport: null
  });
  const page = await browser.newPage();
  
  async function processPage() {
    try {
      await page.goto('https://www.pixels.tips/resources', { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log('Đợi tiêu đề hiển thị...');
      // await page.waitForSelector(
      //   '#woodwork > section > div.flex.items-center.mt-2.sm\\:mt-0.mb-2.px-3.gap-3 > div:nth-child(2) > h2', 
      //   { 
      //     visible: true,
      //     timeout: 30000 
      //   }
      // );
   
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
            setValueToElement("#marketplace-fee-input", "22");
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
        const targetItems = ["Popberry", "Grainbow", "Blue Grumpkin"];
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