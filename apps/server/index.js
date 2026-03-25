const express = require("express");
const { processJob } = require("./processJob");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/process", async (req, res) => {
  try {
    const result = await processJob(req.body);
    res.json(result);
  } catch (error) {
    console.error("Failed to process job:", error);
    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: error.message || "Unexpected error while processing job"
    });
  }
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
