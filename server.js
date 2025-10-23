const express = require('express');
const cors = require('cors');
const fs = require('fs/promises'); // لاستخدام نظام الملفات

const app = express();
const port = process.env.PORT || 3001; // استخدم المنفذ 3001 افتراضيًا
const dbPath = './db.json';

// السماح بالطلبات من أي مصدر
app.use(cors());

// نقطة وصول (endpoint) لجلب عدد الزوار الحالي
app.get('/get', async (req, res) => {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const json = JSON.parse(data);
    res.json({ visits: json.visits });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read visit count' });
  }
});

// نقطة وصول (endpoint) لزيادة عدد الزوار بمقدار واحد
app.get('/hit', async (req, res) => {
  try {
    const data = await fs.readFile(dbPath, 'utf8');
    const json = JSON.parse(data);
    json.visits += 1; // زيادة العداد
    await fs.writeFile(dbPath, JSON.stringify(json, null, 2)); // حفظ القيمة الجديدة
    res.json({ visits: json.visits }); // إرجاع القيمة الجديدة
  } catch (error) {
    res.status(500).json({ error: 'Failed to update visit count' });
  }
});

app.listen(port, () => {
  console.log(`Visitor counter API listening at http://localhost:${port}`);
});