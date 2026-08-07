chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'steamInventoryFetch') return false;

  (async () => {
    try {
      const { steamId } = message;
      const allDescriptions = [];
      const allAssets = [];
      let lastAssetId = null;

      while (true) {
        const url = new URL(`https://steamcommunity.com/inventory/${steamId}/730/2`);
        url.searchParams.set('l', 'english');
        url.searchParams.set('count', '2000');
        if (lastAssetId) url.searchParams.set('start_assetid', lastAssetId);

        const res = await fetch(url.toString(), { credentials: 'include' });
        const body = await res.text().catch(() => '');
        if (!res.ok) {
          sendResponse({ error: `Steam ${res.status}: ${body.slice(0, 200)}` });
          return;
        }

        const page = JSON.parse(body);
        if (!page?.assets) {
          sendResponse({ error: 'Empty or private inventory' });
          return;
        }

        allAssets.push(...page.assets);
        for (const d of (page.descriptions ?? [])) {
          if (!allDescriptions.some(e => e.classid === d.classid)) allDescriptions.push(d);
        }
        if (!page.more_items || !page.last_assetid) break;
        lastAssetId = page.last_assetid;
        await new Promise(r => setTimeout(r, 1000));
      }

      sendResponse({ data: { descriptions: allDescriptions, assets: allAssets } });
    } catch (e) {
      sendResponse({ error: e.message });
    }
  })();

  return true; // keep channel open for async response
});
