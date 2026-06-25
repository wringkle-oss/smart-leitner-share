const endpoint =
  process.env.IMPORT_EBS_URL ||
  "http://127.0.0.1:3000/api/import-daily-ebs";

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  }
});

const text = await response.text();

try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}

if (!response.ok) {
  process.exitCode = 1;
}
