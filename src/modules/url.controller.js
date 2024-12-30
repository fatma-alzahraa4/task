import mongoose from "mongoose";
import { URLModel } from "../../DB/urlModel.js";
import { getOrSetCache } from "../utils/redis.js";
import { AnalyticsModel } from './../../DB/analyticsModel.js';

export const storeVisit = async (req, shortId) => {
  // get client's IP address
  const ipAddress =
    req.headers['x-forwarded-for']?.split(',').shift() ||
    req.connection?.remoteAddress ||
    req.ip;

  try {
    // find and update analytics and create new one if doesn't exist
    const analyticsDoc = await AnalyticsModel.findOneAndUpdate(
      { shortId },
      {
        $inc: { visitCount: 1 }, // increment visit count by 1
        $push: { visitDetails: { ipAddress, timestamp: new Date() } },
      },
      { upsert: true, new: true } // create new one if not found and return updated one
    );

    return analyticsDoc;
  } catch (error) {
    console.error('Error updating analytics:', error);
    return next(new Error('Error updating analytics.', { cause: 500 }));
  }
};


export const shortenURL = async (req, res, next) => {
  const { originalURL, expiresAt } = req.body;

  if (!originalURL) {
    return next(new Error('Original URL is required', { cause: 400 }));
  }

  try {
    //generate unique identifier
    const shortId = new mongoose.Types.ObjectId().toString();

    const newURL = {
      originalURL,
      shortId,
      expiresAt
    }

    await URLModel.create(newURL);

    const shortenedURL = `${req.protocol}://${req.headers.host}/${shortId}`;
    res.status(201).json({ message: "Original URL Shortened successfully.", shortened_URL: shortenedURL });
  } catch (error) {
    console.error(error);
    return next(new Error('Internal Server Error', { cause: 500 }));
  }
}


export const redirectURL = async (req, res, next) => {
  const { shortId } = req.params;

  try {
    const URLDoc = await getOrSetCache(`${shortId}`, async () => {

      const URLDoc = await URLModel.findOne({ shortId });

      if (!URLDoc) {
        return next(new Error('Shortened URL not found.', { cause: 404 }));
      }
      // check for expiration for URL
      if (URLDoc.expiresAt && URLDoc.expiresAt < new Date()) {
        await URLModel.deleteOne({ shortId })
        return next(new Error('URL has expired.', { cause: 410 }));
      }
      const data = URLDoc
      return data;
    }, 3600)

    // update analytics data in the database
    storeVisit(req, shortId);

    // redirect to the original URL
    res.redirect(URLDoc?.originalURL);
  } catch (error) {
    console.error(error);
    return next(new Error('Internal Server Error', { cause: 500 }));
  }
}

export const getAnalytics = async (req, res, next) => {
  const { shortId } = req.params
  try {
    // get analytics from the database
    const analyticsData = await AnalyticsModel.findOne({ shortId });

    if (!analyticsData) {
      return next(new Error('No analytics data found for this ID..', { cause: 404 }));
    }

    // breakdown visits by IP
    const visitsByIP = analyticsData.visitDetails.reduce((acc, visit) => {
      const ip = visit.ipAddress;
      acc[ip] = (acc[ip] || 0) + 1; // count visits for each IP
      return acc;
    }, {});

    // breakdown visits by timestamp per day
    const visitsByTimestamp = analyticsData.visitDetails.reduce((acc, visit) => {
      const timestamp = visit.timestamp.toISOString().slice(0, 10);
      acc[timestamp] = (acc[timestamp] || 0) + 1; // count visits per day
      return acc;
    }, {});


    const response = {
      shortId,
      totalVisits: analyticsData.visitCount,
      visitsByIP,
      visitsByTimestamp
    };

    res.status(200).json({Analytics:response});
  } catch (error) {
    console.error('Error fetching analytics:', error);
    next(new Error('Internal Server Error', { cause: 500 }));
  }
}