import contextMenu from 'electron-context-menu';

export default () => {
  contextMenu({
    showSaveImage: true,
    showCopyImageAddress: true,
  });
};
