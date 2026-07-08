const force = process.argv.includes("--force");
const program = getArgValue("--program") || "all";
const baseEndpoint =
  process.env.IMPORT_EBS_URL ||
  "http://127.0.0.1:3000/api/import-daily-ebs";
const endpoint = new URL(baseEndpoint);

endpoint.searchParams.set("program", program);

if (force) {
  endpoint.searchParams.set("force", "1");
}

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ force, program })
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

function getArgValue(name) {
  const exactPrefix = `${name}=`;
  const exact = process.argv.find((arg) => arg.startsWith(exactPrefix));

  if (exact) {
    return exact.slice(exactPrefix.length);
  }

  const index = process.argv.indexOf(name);

  return index >= 0 ? process.argv[index + 1] : null;
}
