<script lang="ts">
    import type { character, groupChat, Message, StreamingDisplayOptimizationMode } from '../../ts/storage/database/schema';
    import { mount, onDestroy, unmount, untrack } from 'svelte';
    import Chat from './Chat.svelte';
    import { getCharImage } from 'src/ts/characters';
    import { createSimpleCharacter, selectedCharID, ReloadChatPointer, ReloadGUIPointer } from 'src/ts/stores.svelte';
    import { characterStore, settingsStore } from 'src/ts/stores/domain';
    import { chatFoldedStateMessageIndex } from 'src/ts/globalApi.svelte';
    import { get } from 'svelte/store';
    import { getAbsoluteChatMessageIndex } from 'src/ts/chatLoadPages';
    import { illustrationDisplayLayout } from 'src/ts/process/illustration/illustrationDisplay';
    import isEqual from 'lodash/isEqual';
    
    const getCurrentChatRoomId = () => {
        if (targetCharacterIndex < 0 || targetChatIndex < 0) return null;
        const char = characterStore.characters[targetCharacterIndex];
        if (!char) return null;
        return char.chats?.[targetChatIndex]?.id ?? null;
    };

    let {
        messages,
        currentCharacter,
        onReroll = () => {},
        unReroll = () => {},
        onNextReroll = () => {},
        rerollPages = () => null,
        currentUsername,
        userIcon,
        loadPages = messages.length,
        userIconPortrait,
        hasNewUnreadMessage = $bindable(false),
        hideButtons = false,
        renderFromBeginning = false,
        targetCharacterIndex = get(selectedCharID),
        targetChatIndex = characterStore.characters[targetCharacterIndex]?.chatPage ?? 0,
    }:{
        messages: Message[]
        currentCharacter: character|groupChat
        onReroll?: (messageIndex?: number) => void | Promise<void>
        unReroll?: (messageIndex?: number) => void | Promise<void>
        onNextReroll?: (messageIndex?: number) => void | Promise<void>
        rerollPages?: (messageIndex: number) => { current: number, total: number } | null
        currentUsername: string
        userIcon: string
        loadPages?: number
        userIconPortrait?: boolean
        hasNewUnreadMessage?: boolean
        hideButtons?: boolean
        renderFromBeginning?: boolean
        targetCharacterIndex?: number
        targetChatIndex?: number
    } = $props();

    let chatBody: HTMLDivElement;
    type ChatInstance = {
        updateStreamingDisplay?: (state: {
            isOptimizedStreamingMessage: boolean
            streamingOptimizationMode: StreamingDisplayOptimizationMode
            rawStreamingText: string
        }) => void
    }
    type RenderSignature = {
        data: string
        idx: number
        scriptIdx: number
        role: string
        name: string
        largePortrait: boolean
        disabled: Message['disabled']
        reloadPointer: number
        guiReloadPointer: number
        hideButtons: boolean
        isComment: boolean
        activeStreaming: boolean
        rerollIcon: boolean
        targetCharacterIndex: number
        targetChatIndex: number
        generationInfo: Message['generationInfo']
    }
    type RenderEntry = {
        signature: RenderSignature
        instance: ChatInstance
        element: HTMLDivElement
        messageState: { value: Message; totalLength: number }
    }
    const renderEntries = new Map<string, RenderEntry>();

    const unmountChatInstance = (instance: ChatInstance) => {
        untrack(() => {
            try { unmount(instance); } catch (e) {}
        });
    };

    const messageRenderKey = (message: Message, index: number) =>
        message.chatId ? `message:${message.chatId}` : `index:${index}`;

    const sameRenderSignature = (left: RenderSignature, right: RenderSignature) =>
        left.data === right.data &&
        left.idx === right.idx &&
        left.scriptIdx === right.scriptIdx &&
        left.role === right.role &&
        left.name === right.name &&
        left.largePortrait === right.largePortrait &&
        left.disabled === right.disabled &&
        left.reloadPointer === right.reloadPointer &&
        left.guiReloadPointer === right.guiReloadPointer &&
        left.hideButtons === right.hideButtons &&
        left.isComment === right.isComment &&
        left.activeStreaming === right.activeStreaming &&
        left.rerollIcon === right.rerollIcon &&
        left.targetCharacterIndex === right.targetCharacterIndex &&
        left.targetChatIndex === right.targetChatIndex &&
        isEqual(left.generationInfo, right.generationInfo);

    const clearChatBody = () => {
        renderEntries.forEach(({ instance }) => {
            unmountChatInstance(instance);
        });
        renderEntries.clear();
        if (chatBody) {
            chatBody.innerHTML = '';
        }
    };

    const updateChatBody = () => {
        if(!chatBody){
            return
        }

        let nextKey: string | null = null;
        const currentKeys = new Set<string>();
        const charImage = getCharImage(currentCharacter.image, 'css', { thumbnail: true })
        const userImage = getCharImage(userIcon, 'css', { thumbnail: true })
        const simpleChar = createSimpleCharacter(currentCharacter);
        let loadStart = messages.length - 1
        let loadEnd = messages.length - (loadPages ?? messages.length)
        if(renderFromBeginning){
            loadStart = Math.min(messages.length - 1, Math.max(0, (loadPages ?? messages.length) - 1))
            loadEnd = 0
        }
        const currentChat = currentCharacter?.chats?.[targetChatIndex]
        const configuredPerformanceMode = settingsStore.state.streamingDisplayOptimizationMode ?? 'off';
        const performanceMode = currentChat?.isStreaming
            ? currentChat.activeStreamingDisplayOptimizationMode ?? configuredPerformanceMode
            : configuredPerformanceMode
        const activeStreamingIndex = performanceMode !== 'off' && currentChat?.isStreaming
            ? messages.length - 1
            : -1

        if(!renderFromBeginning && !hideButtons && chatFoldedStateMessageIndex.index !== -1){
            loadStart = chatFoldedStateMessageIndex.index
            loadEnd = Math.max(0, chatFoldedStateMessageIndex.index - (loadPages ?? messages.length))
        }

        const totalMessages = messages.length;
        const reloadPointerMap = get(ReloadChatPointer);

        for(let i=loadStart ; i >= loadEnd; i--){
            if(i < 0) break;
            const message = messages[i];
            const messageData = message.data;
            const scriptIdx = getAbsoluteChatMessageIndex(i, currentChat?.messageOffset);
            const key = messageRenderKey(message, i);
            currentKeys.add(key);
            const messageLargePortrait = message.role === 'user' ? (userIconPortrait ?? false) : ((currentCharacter as character).largePortrait ?? false);
            const reloadPointer = reloadPointerMap[scriptIdx] ?? 0;
            const activeStreamingMessage = i === activeStreamingIndex && message.role === 'char';
            const rerollIcon = message.role === 'char' || message.role === 'user';
            const signature: RenderSignature = {
                // Image tokens change on completion/reroll without changing narrative text.
                data: activeStreamingMessage ? '' : illustrationDisplayLayout(messageData, message.illustrations).display,
                idx: i,
                scriptIdx,
                role: message.role,
                name: message.role === 'user' ? currentUsername : (message.name || currentCharacter.name),
                largePortrait: messageLargePortrait,
                disabled: message.disabled,
                reloadPointer,
                guiReloadPointer: $ReloadGUIPointer,
                hideButtons,
                isComment: message.isComment ?? false,
                activeStreaming: activeStreamingMessage,
                rerollIcon,
                targetCharacterIndex,
                targetChatIndex,
                generationInfo: message.generationInfo,
            };
            let entry = renderEntries.get(key);
            const needsMount = !entry || !sameRenderSignature(entry.signature, signature);
            if(needsMount){
                const element = document.createElement('div');
                element.classList.add('chat-message-container');
                if(entry){
                    unmountChatInstance(entry.instance);
                    entry.element.replaceWith(element);
                } else {
                    const nextElement = nextKey ? renderEntries.get(nextKey)?.element : null;
                    if(nextElement){
                        chatBody.insertBefore(element, nextElement.nextSibling);
                    } else {
                        chatBody.prepend(element);
                    }
                }
                let messageState = $state({ value: message, totalLength: totalMessages });
                const instance = untrack(() => mount(Chat, {
                    target: element,
                    props: {
                        get message() { return messageState.value.data; },
                        get sourceMessage() { return messageState.value; },
                        get totalLength() { return messageState.totalLength; },
                        isLastMemory: false,
                        idx: i,
                        scriptIdx,
                        img: message.role === 'user' ? userImage : charImage,
                        onReroll: onReroll,
                        unReroll: unReroll,
                        onNextReroll: onNextReroll,
                        rerollPages: rerollPages,
                        rerollIcon,
                        character: simpleChar,
                        largePortrait: messageLargePortrait,
                        messageGenerationInfo: message.generationInfo,
                        role: message.role,
                        name: signature.name,
                        isComment: signature.isComment,
                        disabled: message.disabled ?? false,
                        isOptimizedStreamingMessage: activeStreamingMessage,
                        streamingOptimizationMode: performanceMode,
                        rawStreamingText: messageData,
                        hideButtons: hideButtons,
                        targetCharacterIndex,
                        targetChatIndex,
                    },
                }))
                entry = { signature, instance, element, messageState };
                renderEntries.set(key, entry);
            } else {
                // Preserve Chat/ChatBody while SQL hydration replaces the resident message.
                entry.messageState.value = message;
                entry.messageState.totalLength = totalMessages;
                // Finished messages must not receive streaming-state writes on every hydration.
                if (activeStreamingMessage) {
                    untrack(() => entry!.instance.updateStreamingDisplay?.({
                        isOptimizedStreamingMessage: activeStreamingMessage,
                        streamingOptimizationMode: performanceMode,
                        rawStreamingText: messageData,
                    }));
                }
            }
            nextKey = key;
        }

        for (const [key, entry] of renderEntries) {
            if (currentKeys.has(key)) continue;
            unmountChatInstance(entry.instance);
            entry.element.remove();
            renderEntries.delete(key);
        }
    };

    onDestroy(() => {
        clearChatBody();
    })

    function checkIfAtBottom() {
        if (!chatBody || !chatBody.parentElement) return true;
        const sc = chatBody.parentElement;
        const lastEl = chatBody.firstElementChild;
        if (!lastEl) return true;
        const rect = lastEl.getBoundingClientRect();
        const scRect = sc.getBoundingClientRect();
        return rect.top <= scRect.bottom + 100;
    }

    export const scrollToLatestMessage = () => {
        if(!chatBody) return;
        hasNewUnreadMessage = false;
        const element = chatBody.firstElementChild;
        if(element){
             element.scrollIntoView({ behavior: 'instant', block: 'start' });
        }
    }

    let previousLength = 0;
    let previousChatRoomId: string | null = null;

    $effect(() => {
        if(!hideButtons){
            void $ReloadChatPointer; // Make $effect track targeted message reloads
            void $ReloadGUIPointer; // Make global script/UI reloads invalidate every rendered message
        }
        const currentChatRoomId = getCurrentChatRoomId();
        const isSameChat = currentChatRoomId === previousChatRoomId;
        if (!isSameChat) {
            clearChatBody();
        }
        const wasAtBottom = checkIfAtBottom();
        updateChatBody()
        
        // Only auto-scroll if it's the same chat and new messages were added
        if(!hideButtons && isSameChat && messages.length > previousLength){
            const lastMsg = messages[messages.length - 1];
            if(lastMsg && lastMsg.role === 'char' && settingsStore.state.autoScrollToNewMessage){
                if(renderFromBeginning){
                    hasNewUnreadMessage = true;
                } else if(wasAtBottom || settingsStore.state.alwaysScrollToNewMessage){
                    const element = chatBody.firstElementChild;
                    if(element){
                        setTimeout(() => {
                            element.scrollIntoView({ behavior: 'instant', block: 'start' });
                        }, 700);
                    }
                } else {
                    hasNewUnreadMessage = true;
                }
            }
        }
        previousLength = messages.length;
        previousChatRoomId = currentChatRoomId;
    })

</script>

<div class="flex flex-col-reverse" bind:this={chatBody}></div>
