import { chat, saveSettingsDebounced } from '../../../../script.js';
import { hideChatMessage } from '../../../chats.js';
import { extension_settings } from '../../../extensions.js';
import { POPUP_TYPE, Popup } from '../../../popup.js';
import { executeSlashCommands, registerSlashCommand, sendNarratorMessage } from '../../../slash-commands.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { SlashCommandEnumValue } from '../../../slash-commands/SlashCommandEnumValue.js';
import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { getSortableDelay } from '../../../utils.js';
import { messageFormattingWithLanding } from './src/messageFormattingWithLanding.js';




class Preset {
    /**
     *
     * @param {*} props
     * @returns {Preset}
     */
    static from(props) {
        return Object.assign(new Preset(), props);
    }

    /**@type {String}*/ name = 'New Preset';
    /**@type {String}*/ regex = '';
    /**@type {String}*/ prompt = '{{segments}}';
    /**@type {String}*/ segmentTemplate = '{{segment}}';
    /**@type {String}*/ segmentJoin = '\n';

    getRegex() {
        const re = /^\/(?<matcher>.+)\/(?<flags>[^/]*)$/;
        if (re.test(this.regex)) {
            const { matcher, flags } = re.exec(this.regex).groups;
            return new RegExp(matcher, flags);
        }
        return null;
    }
}

const defaultPreset = new Preset();
defaultPreset.name = 'Default Preset';
defaultPreset.prompt = `{{segments}}
Combine the above segments into a cohesive part of the story. Check for logical flow, coherence, and organization when adding text between the sections or around them to seamlessly fit the segments together and coherently integrate the final new text into the existing narrative.`;
defaultPreset.segmentTemplate = '<segment>{{segment}}</segment>';
defaultPreset.segmentJoin = '\n';

class Settings {
    static from(props) {
        props.presetList = props.presetList?.map(it=>Preset.from(it)) ?? [Preset.from(defaultPreset)];
        if (props.presetList.length == 0) props.presetList = [defaultPreset];
        const instance = Object.assign(new Settings(), props);
        return instance;
    }

    /**@type {Boolean}*/ zeroBasedIdx = true;
    /**@type {Preset[]}*/ presetList = [Preset.from(defaultPreset)];
    /**@type {String}*/ presetName = 'Default Preset';
    get preset() {
        return this.presetList.find(it=>it.name == this.presetName) ?? Preset.from(defaultPreset);
    }

    save() {
        saveSettingsDebounced();
    }
}
/**@type {Settings}*/
const settings = Settings.from(extension_settings.swipeCombiner ?? {});
extension_settings.swipeCombiner = settings;




const segmenter = new Intl.Segmenter('en', { granularity:'sentence' });
class Snippet {
    /**@type {Number}*/ swipe;
    /**@type {Number}*/ index;
    /**@type {Number}*/ relativeIndex;
    /**@type {String}*/ segment;
    /**@type {HTMLElement}*/ dom;
}
/**
 *
 * @param {{ text:string, isFavorite:boolean }[]} swipes
 * @returns {Promise<string>}
 */
export const showSwipeCombiner = async(swipes) => {
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
    let segments = swipes.map(swipe=>[...segmenter.segment((settings.preset.regex?.length ? swipe.text.replace(settings.preset.getRegex(), '') : swipe.text).replace(/```.*?```/gs,''))].map(it=>it.segment));
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
                    const swipe = swipes[swipeIdx];
                    /**@type {HTMLElement & { tabContent?:HTMLElement }} */
                    const tab = document.createElement('div'); {
                        tab.classList.add('stsc--tab');
                        tab.textContent = settings.zeroBasedIdx ? swipeIdx.toString() : (swipeIdx + 1).toString();
                        if (swipe.isFavorite) {
                            tab.textContent += '⭐';
                        }
                        tab.title = `Swipe ${swipeIdx}`;
                        tab.addEventListener('click', ()=>{
                            Array.from(head.querySelectorAll('.stsc--active')).forEach(it=>it.classList.remove('stsc--active'));
                            tab.classList.add('stsc--active');
                            if (!tab.tabContent) {
                                const tabContent = document.createElement('div'); {
                                    tabContent.classList.add('mes_text');
                                }
                                tab.tabContent = tabContent;
                                tabContent.innerHTML = messageFormattingWithLanding(
                                    segments[swipeIdx].map((it,idx)=>{
                                        const span = document.createElement('span'); {
                                            span.textContent = it;
                                            span.title = 'Click to add / remove snippet';
                                            span.setAttribute('data-stsc--segment', idx.toString());
                                        }
                                        return span.outerHTML;
                                    }).join(''),
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
        return settings.preset.prompt.replace(
            /{{segments}}/g,
            snippets.map(it=>settings.preset.segmentTemplate.replace(/{{segment}}/g, it.segment.trim())).join(settings.preset.segmentJoin),
        );
    }
};
const showSwipeCombinerForMessage = async(mesId) => {
    const mes = chat[mesId];
    const swipes = mes.swipes.map((it,idx)=>({ text:it, isFavorite:mes.swipe_info?.at(idx)?.isFavorite })) ?? [{ text:mes.mes, isFavorite:mes.isFavorite }];
    const combineMessage = await showSwipeCombiner(swipes);
    if (combineMessage) {
        hideChatMessage(mesId, $(document.querySelector(`#chat [mesid="${mesId}"]`)));
        sendNarratorMessage({}, combineMessage);
        await executeSlashCommands('/trigger');
    }
};

registerSlashCommand('swipecombiner',
    (args, value)=>{
        if ((value?.trim() ?? '').length == 0) value = chat.length - 1;
        showSwipeCombinerForMessage(value);
    },
    [],
    '<span class="monospace">(optional messageId)</span> – Open Swipe Combiner on the last message or the message with the provided ID.',
    true,
    true,
);

SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name: 'swipecombiner-preset',
    callback: (args, value)=>{
        if (value.toString().length) {
            const presetName = /**@type {HTMLSelectElement}*/(document.querySelector('#stsc--presetName'));
            presetName.value = value.toString();
            presetName.dispatchEvent(new Event('change', { bubbles:true }));
        }
        return settings.preset.name;
    },
    unnamedArgumentList: [
        SlashCommandArgument.fromProps({ description: 'preset name',
            enumProvider: ()=>settings.presetList.map(it=>new SlashCommandEnumValue(it.name, it.prompt)),
        }),
    ],
    returns: 'Current preset name',
    helpString: 'Gets or sets the Swipe Combiner preset. Call without argument to just return the current preset name.',
}));




const initSettings = async()=>{
    const url = '/scripts/extensions/third-party/SillyTavern-SwipeCombiner/settings.html';
    const response = await fetch(url);
    if (!response.ok) {
        return console.warn('failed to fetch template:', url);
    }
    const settingsTpl = document.createRange().createContextualFragment(await response.text()).querySelector('#stsc--settings');
    /**@type {HTMLElement} */
    // @ts-ignore
    const dom = settingsTpl.cloneNode(true);
    document.querySelector('#extensions_settings').append(dom);

    const zeroBasedIdx = dom.querySelector('#stsc--zeroBasedIdx');
    zeroBasedIdx.checked = settings.zeroBasedIdx;
    dom.querySelector('#stsc--zeroBasedIdx').addEventListener('change', ()=>{
        settings.zeroBasedIdx = zeroBasedIdx.checked;
        settings.save();
    });

    dom.querySelector('#stsc--createPreset').addEventListener('click', ()=>{
        const preset = new Preset();
        settings.presetList.push(preset);
        addOption(preset);
        presetName.value = preset.name;
        presetName.dispatchEvent(new Event('change', { bubbles:true }));
        settings.save();
    });

    dom.querySelector('#stsc--deletePreset').addEventListener('click', ()=>{
        settings.presetList.splice(settings.presetList.indexOf(settings.preset), 1);
        presetName.selectedOptions[0].remove();
        if (presetName.children.length > 0) {
            presetName.value = presetName.children[0].value;
            presetName.dispatchEvent(new Event('change', { bubbles:true }));
        } else {
            addOption(settings.preset);
        }
        settings.save();
    });

    /**
     *
     * @param {Preset} preset
     */
    const addOption = (preset)=>{
        const opt = document.createElement('option'); {
            opt.value = preset.name;
            opt.text = preset.name;
            insertOption(opt);
        }
    };
    const insertOption = (opt)=>{
        const before = Array.from(presetName.children).find(it=>it != opt && it.value.toLowerCase() > opt.value.toLowerCase());
        if (before) before.insertAdjacentElement('beforebegin', opt);
        else presetName.append(opt);
    };

    /**@type {HTMLSelectElement} */
    const presetName = dom.querySelector('#stsc--presetName');
    settings.presetList.forEach(preset=>{
        addOption(preset);
    });
    presetName.value = settings.presetName;
    presetName.addEventListener('change', () => {
        settings.presetName = presetName.value;
        settings.save();
        name.value = settings.preset.name;
        prompt.value = settings.preset.prompt;
        segmentTemplate.value = settings.preset.segmentTemplate;
        segmentJoin.value = settings.preset.segmentJoin;
        updatePreview();
    });

    /**@type {HTMLInputElement} */
    const name = dom.querySelector('#stsc--name');
    name.value = settings.preset.name;
    name.addEventListener('input', () => {
        const preset = settings.preset;
        preset.name = name.value;
        settings.presetName = name.value;
        presetName.selectedOptions[0].value = name.value;
        presetName.selectedOptions[0].textContent = name.value;
        insertOption(presetName.selectedOptions[0]);
        settings.save();
    });

    /**@type {HTMLTextAreaElement} */
    const regex = dom.querySelector('#stsc--regex');
    regex.value = settings.preset.regex;
    regex.addEventListener('input', () => {
        settings.preset.regex = regex.value;
        settings.save();
    });

    /**@type {HTMLTextAreaElement} */
    const prompt = dom.querySelector('#stsc--prompt');
    prompt.value = settings.preset.prompt;
    prompt.addEventListener('input', () => {
        settings.preset.prompt = prompt.value;
        settings.save();
        updatePreview();
    });

    /**@type {HTMLTextAreaElement} */
    const segmentTemplate = dom.querySelector('#stsc--segmentTemplate');
    segmentTemplate.value = settings.preset.segmentTemplate;
    segmentTemplate.addEventListener('input', () => {
        settings.preset.segmentTemplate = segmentTemplate.value;
        settings.save();
        updatePreview();
    });

    /**@type {HTMLTextAreaElement} */
    const segmentJoin = dom.querySelector('#stsc--segmentJoin');
    segmentJoin.value = settings.preset.segmentJoin;
    segmentJoin.addEventListener('input', () => {
        settings.preset.segmentJoin = segmentJoin.value;
        settings.save();
        updatePreview();
    });

    /**@type {HTMLDivElement} */
    const preview = dom.querySelector('#stsc--preview');
    const updatePreview = ()=>{
        preview.textContent = settings.preset.prompt.replace(
            /{{segments}}/g,
            ['foo', 'bar'].map(it=>settings.preset.segmentTemplate.replace(/{{segment}}/g, it)).join(settings.preset.segmentJoin),
        );
    };
    updatePreview();
};
initSettings();
