// src/renderer/src/api/whatsapp.js

export const checkUnreadAndClick = async (webviewRef) => {
  if (!webviewRef.current) return false

  const jsCode = `
    (function() {
      try {
        const unreadBadge = document.querySelector('span[data-testid="icon-unread-count"]') ||
                            document.querySelector('span[aria-label*="unread message"]') ||
                            document.querySelector('span[aria-label*="pesan belum dibaca"]') ||
                            document.querySelector('div[role="gridcell"] span[dir="ltr"]');

        if (unreadBadge && !isNaN(parseInt(unreadBadge.innerText)) && unreadBadge.closest('div[role="row"]')) {
          const chatRow = unreadBadge.closest('div[role="row"]') || unreadBadge.closest('div[role="listitem"]');
          if (chatRow) {
            const clickable = unreadBadge;
            const eventTypes = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
            eventTypes.forEach(type => {
              clickable.dispatchEvent(new MouseEvent(type, {
                view: window,
                bubbles: true,
                cancelable: true,
                buttons: 1,
                clientX: clickable.getBoundingClientRect().left + 2,
                clientY: clickable.getBoundingClientRect().top + 2
              }));
            });
            return true; // Berhasil klik
          }
        }
      } catch (e) {
        return false;
      }
      return false; // Tidak ada pesan belum dibaca
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}

export const extractLatestMessage = async (webviewRef) => {
  if (!webviewRef.current) return null

  const jsCode = `
    (function() {
      try {
        const messageBlocks = document.querySelectorAll('[data-pre-plain-text]') || document.querySelectorAll('.message-in, .message-out');
        if (messageBlocks.length === 0) return null;

        const lastMessageBlock = messageBlocks[messageBlocks.length - 1];
        const preText = lastMessageBlock.getAttribute('data-pre-plain-text') || '';
        const textElement = lastMessageBlock.querySelector('span[data-testid="selectable-text"]') || lastMessageBlock.querySelector('.copyable-text') || lastMessageBlock.querySelector('span[dir="ltr"]');
        const text = textElement ? textElement.innerText.trim() : '[Media/Sticker]';
        
        if (!text) return null;
        
        const currentMessageId = preText + text;

        const isOutgoing = lastMessageBlock.closest('[data-testid^="conv-msg-"]')?.querySelector('[data-testid="tail-out"]') !== null ||
                           lastMessageBlock.closest('[data-testid^="conv-msg-"]')?.querySelector('svg title')?.textContent.toLowerCase().includes('read') ||
                           lastMessageBlock.className.includes('message-out');

        let sender = 'Teman';
        if (preText) {
          const match = preText.match(/]\\s*(.*?):/);
          if (match && match[1]) {
            sender = match[1].trim();
          }
        }

        let quotedSender = null;
        let quotedText = null;
        const quotedBlock = lastMessageBlock.querySelector('[data-testid="quoted-message"]');
        if (quotedBlock) {
          const qSenderEl = quotedBlock.querySelector('span[dir="auto"]');
          if (qSenderEl) quotedSender = qSenderEl.innerText.trim();
          
          const qTextEl = quotedBlock.querySelector('.quoted-mention');
          if (qTextEl) quotedText = qTextEl.innerText.trim();
        }

        const chatTitleElement = document.querySelector('[data-testid="conversation-info-header-chat-title"]') || document.querySelector('header span[dir="auto"]');
        const chatTitle = chatTitleElement ? chatTitleElement.innerText.trim() : sender;

        const isGroup = (sender !== chatTitle && chatTitle !== 'Teman');

        // Ekstrak 4 pesan terakhir sebagai konteks
        const recentHistory = [];
        const recentBlocks = Array.from(messageBlocks).slice(-4);
        for (let block of recentBlocks) {
          const bPreText = block.getAttribute('data-pre-plain-text') || '';
          const bTextEl = block.querySelector('span[data-testid="selectable-text"]') || block.querySelector('.copyable-text') || block.querySelector('span[dir="ltr"]');
          const bText = bTextEl ? bTextEl.innerText.trim() : '[Media/Sticker]';
          
          if (!bText) continue;
          
          let bSender = 'Teman';
          if (bPreText) {
            const match = bPreText.match(/]\\s*(.*?):/);
            if (match && match[1]) bSender = match[1].trim();
          }
          
          const isBOutgoing = block.closest('[data-testid^="conv-msg-"]')?.querySelector('[data-testid="tail-out"]') !== null ||
                             block.closest('[data-testid^="conv-msg-"]')?.querySelector('svg title')?.textContent.toLowerCase().includes('read') ||
                             block.className.includes('message-out') || bSender === 'Anda';
                             
          if (isBOutgoing) bSender = 'Mark (Kamu)';
          
          recentHistory.push({ sender: bSender, text: bText });
        }

        return {
          id: currentMessageId,
          text,
          sender,
          chatTitle,
          isGroup,
          isOutgoing,
          quotedSender,
          quotedText,
          recentHistory
        };
      } catch (e) {
        return null;
      }
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}

export const sendReplyMessage = async (webviewRef, text) => {
  if (!webviewRef.current) return false

  // Escape text for javascript execution
  const escapedText = JSON.stringify(text);

  const jsCode = `
    (function() {
      try {
        const textToInject = ${escapedText};
        const inputBox = document.querySelector('div[contenteditable="true"][data-tab="10"]') || 
                         document.querySelector('div[contenteditable="true"][title="Ketik pesan"]') || 
                         document.querySelector('div[contenteditable="true"][title="Type a message"]') || 
                         document.querySelector('footer div[contenteditable="true"]');
        
        if (inputBox) {
          inputBox.focus();
          
          // Lexical Editor di WA terkadang mengabaikan <br> dari insertHTML.
          // Cara paling "Hacker" dan 100% Works: Simulasi ketik baris per baris + pencet Shift+Enter!
          const lines = textToInject.split('\\n');
          for (let i = 0; i < lines.length; i++) {
            // Masukkan teks untuk baris ini
            if (lines[i]) {
              document.execCommand('insertText', false, lines[i]);
            }
            
            // Jika bukan baris terakhir, pencet Shift+Enter untuk bikin baris baru
            if (i < lines.length - 1) {
              const shiftEnterEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                shiftKey: true // Kunci utama biar WA bikin enter, bukan kirim pesan!
              });
              inputBox.dispatchEvent(shiftEnterEvent);
            }
          }
          
          inputBox.dispatchEvent(new Event('input', { bubbles: true }));
          
          setTimeout(() => {
            const sendButton = document.querySelector('span[data-icon="send"]')?.closest('button') || 
                               document.querySelector('button[aria-label="Kirim"]') || 
                               document.querySelector('button[aria-label="Send"]');
            
            if (sendButton) {
              sendButton.click();
            } else {
              const enterEvent = new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key: 'Enter',
                code: 'Enter',
                keyCode: 13
              });
              inputBox.dispatchEvent(enterEvent);
            }
          }, 800);
          return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    })()
  `;

  return await webviewRef.current.executeJavaScript(jsCode);
}
