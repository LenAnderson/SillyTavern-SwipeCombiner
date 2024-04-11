import { chat, messageFormatting } from '../../../../script.js';
import { hideChatMessage } from '../../../chats.js';
import { POPUP_TYPE, Popup, callGenericPopup } from '../../../popup.js';
import { executeSlashCommands, registerSlashCommand, sendNarratorMessage } from '../../../slash-commands.js';
import { getSortableDelay } from '../../../utils.js';

const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
class Snippet {
    /**@type {Number}*/ swipe;
    /**@type {Number}*/ index;
    /**@type {Number}*/ relativeIndex;
    /**@type {String}*/ segment;
    /**@type {HTMLElement}*/ dom;
}
const showSwipeCombiner = async(mesId) => {
    const onSort = ()=>{
        const els = Array.from(snippetsDom.children);
        for (let idx = els.length - 1; idx >= 0; idx--) {
            const el = els[idx];
            const snippetIdx = snippets.findIndex(it=>it.dom == el);
            const snippet = snippets[snippetIdx];
            if (snippets[idx] != snippet) {
                [snippets[idx], snippets[snippetIdx]] = [snippet, snippets[idx]];
            }
        }
        console.log('SNIPS', snippets);
    };
    const mes = chat[mesId];
    /**@type {String[]} */
    const swipes = mes.swipes ?? [mes.mes];
    let segments = swipes.map(swipe=>Array.from(segmenter.segment(swipe.replace(/```.*?```/gs,''))).map(it=>it.segment));
    /**@type {Snippet[]} */
    const snippets = [];
    let snippetsDom;
    let mesHolder;
    const dom = document.createElement('div'); {
        dom.classList.add('stsc--modal');
        const swipeTabs = document.createElement('div'); {
            swipeTabs.classList.add('stsc--swipes');
            const head = document.createElement('div'); {
                head.classList.add('stsc--head');
                for (let swipeIdx = 0; swipeIdx < swipes.length; swipeIdx++) {
                    const tab = document.createElement('div'); {
                        tab.classList.add('stsc--tab');
                        tab.textContent = swipeIdx.toString();
                        tab.title = `Swipe ${swipeIdx}`;
                        tab.addEventListener('click', ()=>{
                            Array.from(head.querySelectorAll('.stsc--active')).forEach(it=>it.classList.remove('stsc--active'));
                            tab.classList.add('stsc--active');
                            if (!tab.tabContent) {
                                const tabContent = document.createElement('div'); {
                                    tabContent.classList.add('mes_text');
                                }
                                tab.tabContent = tabContent;
                                tabContent.innerHTML = messageFormatting(
                                    segments[swipeIdx].map((it,idx)=>{
                                        const span = document.createElement('span'); {
                                            span.textContent = it;
                                            span.title = 'Click to add / remove snippet';
                                            span.setAttribute('data-stsc--segment', idx.toString());
                                        }
                                        return span.outerHTML;
                                    }).join(''),
                                    null,
                                    false,
                                    false,
                                    null,
                                );
                                Array.from(tabContent.querySelectorAll('[data-stsc--segment]')).forEach((span,segmentIdx)=>{
                                    if (snippets.find(it=>it.swipe == swipeIdx && it.index == segmentIdx)) {
                                        span.classList.add('stsc--selected');
                                    }
                                    span.addEventListener('click', ()=>{
                                        const snippet = new Snippet();
                                        snippet.swipe = swipeIdx;
                                        snippet.index = segmentIdx;
                                        snippet.relativeIndex = segmentIdx / segments[swipeIdx].length;
                                        snippet.segment = segments[swipeIdx][segmentIdx];
                                        const dupe = snippets.find(it=>it.swipe == swipeIdx && it.index == segmentIdx);
                                        if (dupe) {
                                            dupe.dom.remove();
                                            snippets.splice(snippets.indexOf(dupe), 1);
                                            span.classList.remove('stsc--selected');
                                            return;
                                        }
                                        span.classList.add('stsc--selected');
                                        const before = snippets.findIndex(it=>it.relativeIndex > snippet.relativeIndex);
                                        const after = snippets.findLastIndex(it=>it.relativeIndex < snippet.relativeIndex);
                                        const index = Math.max(before, after);
                                        const outer = document.createElement('div'); {
                                            snippet.dom = outer;
                                            outer.classList.add('stsc--snippet');
                                            outer.classList.add('mes');
                                            outer.setAttribute('data-stsc--swipe', swipeIdx.toString());
                                            outer.setAttribute('data-stsc--segment', segmentIdx.toString());
                                            outer.title = 'Drag to reorder\nRight-click to remove';
                                            outer.addEventListener('pointerenter', ()=>{
                                                span.classList.add('stsc--hover');
                                            });
                                            outer.addEventListener('pointerleave', ()=>{
                                                span.classList.remove('stsc--hover');
                                            });
                                            outer.addEventListener('contextmenu', (evt)=>{
                                                evt.preventDefault();
                                                evt.stopPropagation();
                                                outer.remove();
                                                snippets.splice(snippets.findIndex(it=>it.swipe == swipeIdx && it.index == segmentIdx), 1);
                                                span.classList.remove('stsc--selected');
                                                span.classList.remove('stsc--hover');
                                            });
                                            const inner = document.createElement('div'); {
                                                inner.classList.add('mes_text');
                                                const clone = span.cloneNode(true);
                                                clone.removeAttribute('title');
                                                if (span.closest('q')) {
                                                    const q = document.createElement('q'); {
                                                        q.append(clone);
                                                        inner.append(q);
                                                    }
                                                } else {
                                                    inner.append(clone);
                                                }
                                                outer.append(inner);
                                            }
                                        }
                                        if (index > -1) {
                                            snippets[index].dom.insertAdjacentElement(index == before ? 'beforebegin' : 'afterend', outer);
                                        } else {
                                            keepers.append(outer);
                                        }
                                        if (index > -1) {
                                            snippets.splice(index + (index == after ? 1 : 0), 0, snippet);
                                        } else {
                                            snippets.push(snippet);
                                        }
                                    });
                                });
                            }
                            mesHolder.innerHTML = '';
                            mesHolder.append(tab.tabContent);
                        });
                        head.append(tab);
                    }
                }
                swipeTabs.append(head);
            }
            const content = document.createElement('div'); {
                mesHolder = content;
                content.classList.add('stsc--content');
                content.classList.add('mes');
                swipeTabs.append(content);
            }
            dom.append(swipeTabs);
        }
        const keepers = document.createElement('div'); {
            snippetsDom = keepers;
            keepers.classList.add('stsc--snippets');
            // @ts-ignore
            $(keepers).sortable({
                delay: getSortableDelay(),
                stop: () => onSort(),
            });
            dom.append(keepers);
        }
    }
    const dlg = new Popup(dom, POPUP_TYPE.CONFIRM, null, { wide:true, large:true, okButton:'Combine', cancelButton:'Abort' });
    const popupPromise = dlg.show();
    document.querySelector('.stsc--modal .stsc--tab').click();
    const popupResult = await popupPromise;
    console.log(popupResult, snippets);
    if (popupResult && snippets.length > 0) {
        hideChatMessage(mesId, $(document.querySelector(`#chat [mesid="${mesId}"]`)));
        sendNarratorMessage({}, [...snippets.map(it=>`<segment>${it.segment}</segment>`), 'Combine the above segments into a cohesive part of the story. Check for logical flow, coherence, and organization when adding text between the sections or around them to seamlessly fit the segments together and coherently integrate the final new text into the existing narrative.'].join('\n'));
        await executeSlashCommands('/trigger');
    }
};

registerSlashCommand('swipecombiner',
    (args, value)=>{
        if ((value?.trim() ?? '').length == 0) value = chat.length - 1;
        showSwipeCombiner(value);
    },
    [],
    '<span class="monospace">(optional messageId)</span> – Open Swipe Combiner on the last message or the message with the provided ID.',
    true,
    true,
);
