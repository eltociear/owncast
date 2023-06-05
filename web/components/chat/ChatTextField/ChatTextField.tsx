/* eslint-disable jsx-a11y/no-static-element-interactions */
import { Popover, Select } from 'antd';
import React, { FC, useCallback, useMemo, useRef, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Transforms, createEditor, BaseEditor, Text, Descendant, Editor, Range } from 'slate';
import {
  Slate,
  DefaultPlaceholder,
  Editable,
  withReact,
  ReactEditor,
  useSelected,
  useFocused,
} from 'slate-react';
import dynamic from 'next/dynamic';
import classNames from 'classnames';
import WebsocketService from '../../../services/websocket-service';
import { websocketServiceAtom } from '../../stores/ClientConfigStore';
import { MessageType } from '../../../interfaces/socket-events';
import styles from './ChatTextField.module.scss';

// Lazy loaded components

const EmojiPicker = dynamic(() => import('./EmojiPicker').then(mod => mod.EmojiPicker), {
  ssr: false,
});

const SendOutlined = dynamic(() => import('@ant-design/icons/SendOutlined'), {
  ssr: false,
});

const SmileOutlined = dynamic(() => import('@ant-design/icons/SmileOutlined'), {
  ssr: false,
});

type CustomElement =
  | { type: 'paragraph' | 'span'; children: CustomText[] }
  | ImageNode
  | MentionElement;
type CustomText = { text: string };

type EmptyText = {
  text: string;
};

type ImageNode = {
  type: 'image';
  alt: string;
  src: string;
  name: string;
  children: EmptyText[];
};

type MentionElement = {
  type: 'mention';
  name: string;
  children: CustomText[];
};

declare module 'slate' {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor;
    Element: CustomElement;
    Text: CustomText;
  }
}

const Image = p => {
  const { attributes, element, children } = p;

  const selected = useSelected();
  const focused = useFocused();
  return (
    <span {...attributes} contentEditable={false}>
      <img
        alt={element.alt}
        src={element.src}
        title={element.name}
        style={{
          display: 'inline',
          maxWidth: '50px',
          maxHeight: '20px',
          boxShadow: `${selected && focused ? '0 0 0 3px #B4D5FF' : 'none'}`,
        }}
      />
      {children}
    </span>
  );
};

const Mention = p => {
  const { attributes, element, children } = p;

  return (
    <span {...attributes} className={styles.userMention} contentEditable={false}>
      @{element.name}&nbsp;
      {children}
    </span>
  );
};

const withImages = editor => {
  const { isVoid } = editor;

  // eslint-disable-next-line no-param-reassign
  editor.isVoid = element => (element.type === 'image' ? true : isVoid(element));
  // eslint-disable-next-line no-param-reassign
  editor.isInline = element => element.type === 'image';

  return editor;
};

const withMentions = editor => {
  const { isInline, isVoid } = editor;

  // eslint-disable-next-line no-param-reassign
  editor.isInline = element => (element.type === 'mention' ? true : isInline(element));
  // eslint-disable-next-line no-param-reassign
  editor.isVoid = element => (element.type === 'mention' ? true : isVoid(element));

  return editor;
};

const serialize = node => {
  if (Text.isText(node)) {
    const string = node.text;
    return string;
  }

  let children;
  if (node.children.length === 0) {
    children = [{ text: '' }];
  } else {
    children = node.children?.map(n => serialize(n)).join('');
  }

  switch (node.type) {
    case 'paragraph':
      return `<p>${children}</p>`;
    case 'image':
      return `<img src="${node.src}" alt="${node.alt}" title="${node.name}" class="emoji"/>`;
    case 'mention':
      return `@${node.name}&nbsp;`;
    default:
      return children;
  }
};

const getCharacterCount = node => {
  if (Text.isText(node)) {
    return node.text.length;
  }

  // Hard code each image to count as 5 characters.
  if (node.type === 'image') {
    return 5;
  }

  let count = 0;
  node.children.forEach(child => {
    count += getCharacterCount(child);
  });

  return count;
};

export type ChatTextFieldProps = {
  defaultText?: string;
  enabled: boolean;
  focusInput: boolean;
  knownChatUserDisplayNames?: string[];
};

const characterLimit = 300;

export const ChatTextField: FC<ChatTextFieldProps> = ({
  defaultText,
  enabled,
  focusInput,
  knownChatUserDisplayNames,
}) => {
  const [showEmojis, setShowEmojis] = useState(false);
  const [characterCount, setCharacterCount] = useState(defaultText?.length);
  const [showingAutoCompleteMenu, setShowingAutoCompleteMenu] = useState(false);
  const websocketService = useRecoilValue<WebsocketService>(websocketServiceAtom);
  const editor = useMemo(() => withReact(withMentions(withImages(createEditor()))), []);
  const inputRef = useRef<HTMLDivElement>(null);

  const [search, _setSearch] = useState('');

  const chatUserNames = knownChatUserDisplayNames
    ?.filter(c => c.toLowerCase().startsWith(search.toLowerCase()))
    .slice(0, 10);

  const defaultEditorValue: Descendant[] = [
    {
      type: 'paragraph',
      children: [{ text: defaultText || '' }],
    },
  ];

  const sendMessage = () => {
    if (!websocketService) {
      console.log('websocketService is not defined');
      return;
    }

    let message = serialize(editor);
    // Strip the opening and closing <p> tags.
    message = message.replace(/^<p>|<\/p>$/g, '');
    websocketService.send({ type: MessageType.CHAT, body: message });

    // Clear the editor.
    Transforms.delete(editor, {
      at: {
        anchor: Editor.start(editor, []),
        focus: Editor.end(editor, []),
      },
    });
    setCharacterCount(0);
  };

  const createImageNode = (alt, src, name): ImageNode => ({
    type: 'image',
    alt,
    src,
    name,
    children: [{ text: '' }],
  });

  const insertImage = (url, name) => {
    if (!url) return;

    const image = createImageNode(name, url, name);

    Transforms.insertNodes(editor, image);
    Editor.normalize(editor, { force: true });
  };

  const insertMention = (e, chatDisplayName) => {
    const mention: MentionElement = {
      type: 'mention',
      name: chatDisplayName,
      children: [{ text: '' }],
    };
    Transforms.insertNodes(e, mention);
    Transforms.move(e);
  };

  // Native emoji
  const onEmojiSelect = (emoji: string) => {
    ReactEditor.focus(editor);
    Transforms.insertText(editor, emoji);
  };

  const onCustomEmojiSelect = (name: string, emoji: string) => {
    ReactEditor.focus(editor);
    insertImage(emoji, name);
  };

  const onKeyDown = useCallback(
    e => {
      const charCount = getCharacterCount(editor) + 1;

      // Send the message when hitting enter.
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
        return;
      }

      // Always allow backspace.
      if (e.key === 'Backspace') {
        setCharacterCount(charCount - 1);
        return;
      }

      // Limit the number of characters.
      if (charCount + 1 > characterLimit) {
        e.preventDefault();
      }

      setCharacterCount(charCount + 1);
    },
    [editor],
  );

  const onPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');

    const { length } = text;
    if (characterCount + length > characterLimit) {
      e.preventDefault();
    }
  };

  const renderElement = p => {
    switch (p.element.type) {
      case 'image':
        return <Image {...p} />;

      case 'mention':
        return <Mention {...p} />;

      default:
        return <p {...p} />;
    }
  };

  return (
    <div id="chat-input" className={styles.root}>
      <div
        ref={inputRef}
        className={classNames(
          styles.inputWrap,
          characterCount >= characterLimit && styles.maxCharacters,
        )}
      >
        <Slate
          editor={editor}
          initialValue={defaultEditorValue}
          onChange={() => {
            const { selection } = editor;

            if (selection && Range.isCollapsed(selection)) {
              const [start] = Range.edges(selection);
              const wordBefore = Editor.before(editor, start, { unit: 'word' });
              const before = wordBefore && Editor.before(editor, wordBefore);
              const beforeRange = before && Editor.range(editor, before, start);
              const beforeText = beforeRange && Editor.string(editor, beforeRange);
              const beforeMatch = beforeText && beforeText.match(/^@(\w+)$/);
              const after = Editor.after(editor, start);
              const afterRange = Editor.range(editor, start, after);
              const afterText = Editor.string(editor, afterRange);
              const afterMatch = afterText.match(/^(\s|$)/);

              if (beforeMatch && afterMatch) {
                setShowingAutoCompleteMenu(true);
              }
            }
          }}
        >
          <Editable
            className="chat-text-input"
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            disabled={!enabled}
            readOnly={!enabled}
            renderElement={renderElement}
            renderPlaceholder={({ children, attributes }) => (
              <DefaultPlaceholder
                attributes={{
                  ...attributes,
                  style: { ...attributes.style, top: '15%' },
                }}
              >
                {children}
              </DefaultPlaceholder>
            )}
            placeholder={enabled ? 'Send a message to chat' : 'Chat is currently unavailable.'}
            style={{ width: '100%' }}
            role="textbox"
            aria-label="Chat text input"
            autoFocus={focusInput}
          />
          <Popover
            content={
              <EmojiPicker
                onEmojiSelect={onEmojiSelect}
                onCustomEmojiSelect={onCustomEmojiSelect}
              />
            }
            trigger="click"
            placement="topRight"
            onOpenChange={open => setShowEmojis(open)}
            open={showEmojis}
          />
          {showingAutoCompleteMenu && (
            <Select
              defaultOpen
              open
              showArrow={false}
              bordered={false}
              dropdownMatchSelectWidth={false}
              placement="topRight"
              className={styles.autocompleteSelectMenu}
              options={chatUserNames?.map(char => ({
                value: char,
                label: char,
              }))}
              onSelect={value => {
                // Transforms.select(editor, target);
                insertMention(editor, value);
                setShowingAutoCompleteMenu(false);
              }}
              onInputKeyDown={e => {
                if (e.key === 'Escape') {
                  setShowingAutoCompleteMenu(false);
                }
              }}
              // style={{ zIndex: 9999 }}
              getPopupContainer={() => inputRef.current}
              onBlur={() => setShowingAutoCompleteMenu(false)}
            />
          )}
        </Slate>

        {enabled && (
          <div style={{ display: 'flex', paddingLeft: '5px' }}>
            <button
              type="button"
              className={styles.emojiButton}
              title="Emoji picker button"
              onClick={() => setShowEmojis(!showEmojis)}
            >
              <SmileOutlined />
            </button>
            <button
              type="button"
              className={styles.sendButton}
              title="Send message Button"
              onClick={sendMessage}
            >
              <SendOutlined />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
