const express = require("express")
const { chromium } = require("playwright")

const app = express()
const PORT = process.env.PORT || 3001 // Use environment variable for port, default to 3001

app.use(express.json()) // Enable JSON body parsing

// Scraper function
async function scrapeG2Reviews(url) {
  let browser
  try {
    browser = await chromium.launch({ headless: true }) // Run in headless mode for deployment
    const page = await browser.newPage()

    console.log(`Navigating to ${url}`)
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 }) // Wait for DOM to load, 60s timeout

    // Wait for reviews to be visible. Adjust selector if G2's HTML changes.
    // This waits for at least one review card to appear.
    await page.waitForSelector(".review-card", { timeout: 30000 }) // Wait up to 30 seconds for reviews

    const productName = await page
      .$eval("h1.product-name", (el) => el.textContent.trim())
      .catch(() => "Unknown Product")
    const reviews = []
    const ratings = []
    const reviewerData = []

    // Extract reviews
    const reviewCards = await page.$$(".review-card")
    for (const card of reviewCards) {
      const reviewText = await card.$eval(".review-content__text", (el) => el.textContent.trim()).catch(() => null)
      const ratingStr = await card
        .$eval(".rating-display__stars", (el) => el.getAttribute("data-rating"))
        .catch(() => null)
      const reviewDate = await card.$eval(".review-date", (el) => el.textContent.trim()).catch(() => null)

      const reviewerName = await card.$eval(".reviewer__name", (el) => el.textContent.trim()).catch(() => null)
      const reviewerTitle = await card.$eval(".reviewer__title", (el) => el.textContent.trim()).catch(() => null)
      const reviewerCompany = await card.$eval(".reviewer__company", (el) => el.textContent.trim()).catch(() => null)
      const reviewerIndustry = await card.$eval(".reviewer__industry", (el) => el.textContent.trim()).catch(() => "N/A")
      const reviewerCompanySize = await card
        .$eval(".reviewer__company-size", (el) => el.textContent.trim())
        .catch(() => "N/A")

      if (reviewText && ratingStr) {
        reviews.push(reviewText)
        ratings.push(Number.parseFloat(ratingStr))
        reviewerData.push({
          name: reviewerName,
          title: reviewerTitle,
          company: reviewerCompany,
          industry: reviewerIndustry,
          companySize: reviewerCompanySize,
          reviewDate: reviewDate,
        })
      }
    }

    if (reviews.length === 0) {
      console.warn("No reviews found after Playwright scrape. The page might be empty or selectors are outdated.")
      return {
        productName,
        reviews: ["No reviews scraped. Content might be dynamic or selectors are outdated."],
        ratings: [],
        totalReviews: 0,
        reviewerData: [],
      }
    }

    console.log(`Scraped ${reviews.length} reviews for ${productName}.`)
    return {
      productName,
      reviews,
      ratings,
      totalReviews: reviews.length,
      reviewerData,
    }
  } catch (error) {
    console.error("Playwright scraping error:", error)
    throw error
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

// API endpoint for scraping
app.post("/scrape", async (req, res) => {
  const { url } = req.body

  if (!url) {
    return res.status(400).json({ error: "URL is required in the request body." })
  }

  // Basic G2 URL validation
  if (!url.includes("g2.com/products/")) {
    return res.status(400).json({ error: "Please provide a valid G2 product URL." })
  }

  try {
    const scrapedData = await scrapeG2Reviews(url)
    res.json({ success: true, data: scrapedData })
  } catch (error) {
    console.error("API error:", error)
    res.status(500).json({
      error: "Failed to scrape reviews.",
      details: error.message || "Unknown error occurred during scraping.",
    })
  }
})

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).send("Scraper service is running.")
})

app.listen(PORT, () => {
  console.log(`Scraper service listening on port ${PORT}`)
})
