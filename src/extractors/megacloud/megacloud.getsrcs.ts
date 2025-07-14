// src/extractors/megacloud/megacloud.getsrcs.ts

import { USER_AGENT } from '../../utils/utils';
import { load } from 'cheerio'; // You'll need a library like Cheerio to parse HTML
import axios from 'axios';     // A library like Axios is great for making HTTP requests

// A helper function to find the key from the HTML content
async function findKeyInHtml(html: string): Promise<string | null> {
  const $ = load(html);

  // 1. Check for <meta name="_gg_fb">
  const metaKey = $('meta[name="_gg_fb"]').attr('content');
  if (metaKey) {
    console.log('✅ Key found (meta)');
    return metaKey;
  }

  // 2. Check for <!-- _is_th:... -->
  const commentNode = $('*').contents().filter(function() {
    return this.type === 'comment' && this.data?.includes('_is_th:');
  }).first();

  if (commentNode.length > 0) {
      const commentData = commentNode.data()?.trim() ?? '';
      const match = commentData.match(/_is_th:([^\s]+)/);
      if (match && match[1]) {
          console.log('✅ Key found (comment)');
          return match[1];
      }
  }

  // 3. Check for <div data-dpi="...">
  const dpiKey = $('[data-dpi]').attr('data-dpi');
  if (dpiKey) {
    console.log('✅ Key found (data-dpi)');
    return dpiKey;
  }
  
  // 4. Check scripts for window._xy_ws or _lk_db
  let scriptKey: string | null = null;
  $('script').each((_i, el) => {
    const scriptText = $(el).html();
    if (scriptText) {
      const xyMatch = scriptText.match(/window\._xy_ws\s*=\s*['"]([^'"]+)['"]/);
      if (xyMatch && xyMatch[1]) {
        console.log('✅ Key found (_xy_ws)');
        scriptKey = xyMatch[1];
        return false; // exit .each loop
      }

      const lkMatch = scriptText.match(/window\._lk_db\s*=\s*{x:\s*['"]([^'"]+)['"],\s*y:\s*['"]([^'"]+)['"],\s*z:\s*['"]([^'"]+)['"]}/);
      if (lkMatch) {
          console.log('✅ Key found (_lk_db)');
          scriptKey = lkMatch[1] + lkMatch[2] + lkMatch[3];
          return false; // exit .each loop
      }
    }
  });

  if (scriptKey) {
    return scriptKey;
  }

  return null; // Return null if no key was found
}


// The main function, rewritten to use the new logic
export async function getSources(embedUrl: string, referer: string) {
  try {
    const embedId = new URL(embedUrl).pathname.split('/').pop();
    const sourceDomain = new URL(embedUrl).origin;

    // Step 1: Fetch the embed page HTML
    const embedResponse = await axios.get(embedUrl, {
      headers: {
        'Referer': referer,
        'User-Agent': USER_AGENT,
      }
    });
    const html = embedResponse.data;

    // Step 2: Scrape the HTML to find the key
    const key = await findKeyInHtml(html);

    if (!key) {
      console.error("❌ Key not found. The old WASM-based method might be required as a fallback.");
      // Here you could add a fallback to your old V() and getMeta() logic if needed
      throw new Error('Could not find the necessary key to fetch sources.');
    }
    
    // Step 3: Use the key to make the final API call
    // Note: The path might change, adjust as needed based on the python script.
    const apiUrl = `${sourceDomain}/embed-1/v3/e-1/getSources?id=${embedId}&_k=${key}`;

    const apiResponse = await axios.get(apiUrl, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': embedUrl, // The referer for the API call is the embed URL itself
            'User-Agent': USER_AGENT,
        }
    });

    // Step 4: Return the data in the same format as before
    // The python output shows the 'encrypted' field is now false.
    // So we don't need the decryption logic (M() function) anymore.
    const sourcesData = apiResponse.data;

    // Ensure the output format matches what your application expects
    return {
        sources: sourcesData.sources, // This is an array of objects with { file, type }
        tracks: sourcesData.tracks,   // This is the subtitles array
        encrypted: false,
    };

  } catch (err: any) {
    console.error(err.message);
    // Returning a structure that indicates failure but doesn't crash the app
    return { sources: [], tracks: [], encrypted: false, error: err.message };
  }
}
