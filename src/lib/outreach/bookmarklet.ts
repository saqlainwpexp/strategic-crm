/** The drag-to-bookmarks-bar link: opens a small CRM window that adds the current profile. */
export function bookmarkletHref(origin: string) {
  const code = `(()=>{var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title);window.open(${JSON.stringify(
    origin + "/quick-add"
  )}+'?url='+u+'&title='+t,'scrm_quick_add','width=460,height=620');})()`;
  return `javascript:${code}`;
}
