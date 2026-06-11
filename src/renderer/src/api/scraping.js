export const scrapeGoogle = async (webview, url, onCaptcha) => {
  let isCaptchaActive = true
  while (isCaptchaActive) {
    isCaptchaActive = await webview.executeJavaScript(`
        (() => {
          return !!(document.getElementById('captcha-form') || 
                   document.querySelector('iframe[src*="recaptcha"]') ||
                   document.querySelector('#recaptcha') ||
                   document.querySelector('div#captcha'));
        })()
      `)

    if (isCaptchaActive) {
      onCaptcha(true)
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }
  onCaptcha(false)
  const results = await webview.executeJavaScript(
    `(() => {
        function stripHtml(html){
          let tmp = document.createElement("DIV");
          tmp.innerHTML = html;
          return tmp.textContent || tmp.innerText || "";
        }
        const items = [];
        let aiSummary = null;
        const mainCol = document.querySelector('[data-container-id="main-col"].mZJni, .mZJni');
        
        aiSummary = mainCol ? mainCol.innerText : null;
        
        if (aiSummary) {
          aiSummary = stripHtml(aiSummary);
          // Gunakan variabel url yang dipassing dari luar
          items.push({ title: 'AI Google Summary', link: '${url}', snippet: aiSummary });
        }

        const elements = document.querySelectorAll('div.g, div.tF2Cxc, div.v7W49e');

        elements.forEach((el) => {
          if (items.length < 5) {
            const title = el.querySelector('h3')?.innerText?.trim();
            const link = el.querySelector('a')?.href;
            const snippet = el.querySelector('.VwiC3b, div[style*="-webkit-line-clamp"]')?.innerText?.trim();

            if (title && link && link.includes('http')) {
              items.push({ title, link, snippet: snippet || "" });
            }
          }
        });
        return items;
      })()`
  )
  return results
}

export const deepSearch = async (webview, url) => {
  try {
    const content = await webview.executeJavaScript(`
            (() => {
              const wadah = document.createElement('div');
              wadah.style.position = 'fixed';
              wadah.style.opacity = '0';
              wadah.style.pointerEvents = 'none';
              wadah.innerHTML = document.body.innerHTML;
              document.body.appendChild(wadah);

              const sampah = wadah.querySelectorAll('nav, footer, header, aside, script, style, noscript, form, iframe, svg, [class*="sidebar"], [class*="comment"], [class*="ad-"], [class*="promo"], [class*="menu"], [class*="nav"]');
              sampah.forEach(el => el.remove());

              let kontenUtama = wadah.querySelector('article, main, [class*="article"], [class*="content"], [id*="article"], [id*="content"]');
              if (!kontenUtama) kontenUtama = wadah;

              let hasil = kontenUtama.innerText || '';
              wadah.remove();
              
              return hasil.replace(/\\n{3,}/g, '\\n\\n').replace(/\\s{2,}/g, ' ').trim().substring(0, 3000);
            })()
          `)
    return {
      source: url.title,
      url: url.link,
      text: content || 'Gagal ambil konten.'
    }
  } catch (err) {
    console.log(`akses web ${url.link} error karena ${err}`)
    return { source: url.title, url: url.link, text: `Gagal akses website karena: ${err}` }
  }
}
