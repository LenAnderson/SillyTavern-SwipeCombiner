import { callPopup, chat, messageFormatting, sendSystemMessage } from '../../../../script.js';
import { hideChatMessage } from '../../../chats.js';
import { executeSlashCommands, registerSlashCommand, sendNarratorMessage } from '../../../slash-commands.js';
import { getSortableDelay } from '../../../utils.js';

const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
const getSegments = (root, span) => {
    const children = [];
    const nodes = document.evaluate('*', root, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE);
    for (let i = 0; i < nodes.snapshotLength; i++) {
        const node = nodes.snapshotItem(i);
        if (node instanceof HTMLBRElement) {
            // skip
        } else if (node instanceof Text) {
            // text node
            const segments = Array.from(segmenter.segment(node.textContent)).map(it=>it.segment);
            const finalSegment = segments.pop();
            for (const segment of segments) {
                //x
            }
        } else if (node instanceof HTMLElement) {
            // nested element -> recurse
        } else {
            // WTF?!
        }
    }
};
class Snippet {
    /**@type {Number}*/ swipe;
    /**@type {Number}*/ index;
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
                        tab.addEventListener('click', ()=>{
                            Array.from(head.querySelectorAll('.stsc--active')).forEach(it=>it.classList.remove('stsc--active'));
                            tab.classList.add('stsc--active');
                            mesHolder.innerHTML = messageFormatting(
                                segments[swipeIdx].map((it,idx)=>{
                                    const span = document.createElement('span'); {
                                        span.textContent = it;
                                        span.setAttribute('data-stsc--segment', idx.toString());
                                    }
                                    return span.outerHTML;
                                }).join(''),
                                null,
                                false,
                                false,
                                null,
                            );
                            Array.from(mesHolder.querySelectorAll('[data-stsc--segment]')).forEach((span,segmentIdx)=>{
                                span.addEventListener('click', ()=>{
                                    const snippet = new Snippet();
                                    snippet.swipe = swipeIdx;
                                    snippet.index = segmentIdx;
                                    snippet.segment = segments[swipeIdx][segmentIdx];
                                    const dupe = snippets.find(it=>it.swipe == swipeIdx && it.index == segmentIdx);
                                    if (dupe) {
                                        dupe.dom.remove();
                                        snippets.splice(snippets.indexOf(dupe), 1);
                                        return;
                                    }
                                    const before = snippets.find(it=>it.index > segmentIdx);
                                    if (before) {
                                        snippets.splice(snippets.indexOf(before), 0, snippet);
                                    } else {
                                        snippets.push(snippet);
                                    }
                                    const outer = document.createElement('div'); {
                                        snippet.dom = outer;
                                        outer.classList.add('stsc--snippet');
                                        outer.classList.add('mes');
                                        outer.setAttribute('data-stsc--swipe', swipeIdx.toString());
                                        outer.setAttribute('data-stsc--segment', segmentIdx.toString());
                                        outer.title = 'Drag to reorder\nRight-click to remove';
                                        outer.addEventListener('contextmenu', (evt)=>{
                                            evt.preventDefault();
                                            evt.stopPropagation();
                                            outer.remove();
                                            snippets.splice(snippets.findIndex(it=>it.swipe == swipeIdx && it.index == segmentIdx), 1);
                                        });
                                        const inner = document.createElement('div'); {
                                            inner.classList.add('mes_text');
                                            if (span.closest('q')) {
                                                const q = document.createElement('q'); {
                                                    q.append(span.cloneNode(true));
                                                    inner.append(q);
                                                }
                                            } else {
                                                inner.append(span.cloneNode(true));
                                            }
                                            outer.append(inner);
                                        }
                                    }
                                    if (before) {
                                        before.dom.insertAdjacentElement('beforebegin', outer);
                                    } else {
                                        keepers.append(outer);
                                    }
                                });
                            });
                        });
                        head.append(tab);
                    }
                }
                swipeTabs.append(head);
            }
            const content = document.createElement('div'); {
                content.classList.add('stsc--content');
                content.classList.add('mes');
                const contentInner = document.createElement('div'); {
                    mesHolder = contentInner;
                    contentInner.classList.add('mes_text');
                    content.append(contentInner);
                }
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
    const popupPromise = callPopup(dom, 'confirm', null, { wide:true, large:true, okButton:'OK' });
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
        showSwipeCombiner(value ?? chat.length - 1);
    },
    [],
    '',
    true,
    true,
);
