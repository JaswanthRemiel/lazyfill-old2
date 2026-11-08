import type { Message, MessageResponse } from '../shared/messages';
import { extractProfileFromResume, testAi } from './ai';
import * as data from './data';
import * as learned from './learned';
import * as auth from './firebase/auth';
import { getDoc, setDoc } from './firebase/firestore';
import { deleteAccount } from './account';
import * as tracker from './tracker';
import { generateAnswer, getPromptTemplate, savePromptTemplate } from './generate';
import { flushQueue, pendingCount } from './firebase/queue';

/** Toolbar button: show or hide the panel on the current page. */
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  const toggle = () => chrome.tabs.sendMessage(tab.id!, { action: 'togglePanel' }, { frameId: 0 });
  try {
    await toggle();
  } catch {
    try {
      // tab was open before the extension loaded
      await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['content.js'] });
      await toggle();
    } catch {
      // chrome:// pages, the web store, etc. cannot host the panel
      chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#/applications') });
    }
  }
});

const SELECTION_MENU = 'lazyfill-generate-selection';

/** Registered on every worker start; a duplicate id is harmless and keeps the menu after a reload. */
function createSelectionMenu(): void {
  chrome.contextMenus.create({ id: SELECTION_MENU, title: 'Generate with lazyfill', contexts: ['selection'] }, () => void chrome.runtime.lastError);
}
createSelectionMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== SELECTION_MENU || tab?.id == null) return;
  // no frameId: every frame gets it, and the one that owns the selection answers
  chrome.tabs.sendMessage(tab.id, { action: 'startSelection' }).catch(() => {});
});

const FLUSH_ALARM = 'lf-flush-queue';

chrome.tabs.onRemoved.addListener((tabId) => { tracker.forgetTab(tabId).catch(() => {}); });

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(FLUSH_ALARM, { periodInMinutes: 1 });
  chrome.contextMenus.removeAll(createSelectionMenu);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === FLUSH_ALARM) flushQueue().catch(() => {});
});

async function testConnection() {
  const session = await auth.getValidSession();
  const path = `users/${session.uid}/settings/connection-test`;
  const stamp = new Date().toISOString();
  await setDoc(path, { checkedAt: stamp });
  const back = await getDoc(path);
  if (back?.checkedAt !== stamp) throw new Error('Wrote a document but could not read it back. Check your Firestore rules.');
  return { uid: session.uid, email: session.email };
}

async function handle(msg: Message, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;
  switch (msg.action) {
    case 'ping':
      return 'pong';
    case 'testConnection':
      return testConnection();
    case 'signIn':
      return auth.signIn(msg.email, msg.password).then(async (r) => { if (r === 'ok') flushQueue().catch(() => {}); return r; });
    case 'signUp':
      return auth.signUp(msg.email, msg.password);
    case 'resendVerification':
      return auth.resendVerification(msg.email, msg.password);
    case 'sendPasswordReset':
      return auth.sendPasswordReset(msg.email);
    case 'deleteAccount':
      return deleteAccount(msg.password);
    case 'signOut':
      return auth.signOut();
    case 'getSession':
      return auth.getSession().then((s) => (s ? { uid: s.uid, email: s.email } : null));
    case 'listProfiles':
      return data.listProfiles();
    case 'saveProfile':
      return data.saveProfile(msg.profile);
    case 'deleteProfile':
      return data.deleteProfile(msg.id);
    case 'setActiveProfile':
      return data.setActiveProfile(msg.id);
    case 'getActiveProfile':
      return data.getActiveProfile();
    case 'listApplications':
      return data.listApplications();
    case 'saveApplication':
      return data.saveApplication(msg.application);
    case 'deleteApplication':
      return data.deleteApplication(msg.id);
    case 'saveResume':
      return data.saveResume(msg.profileId, msg.file);
    case 'getResume':
      return data.getResume(msg.profileId);
    case 'deleteResume':
      return data.deleteResume(msg.profileId);
    case 'importResume':
      return extractProfileFromResume(msg.source);
    case 'testAi':
      return testAi();
    case 'generateAnswer':
      return generateAnswer({ question: msg.question, job: msg.job, tabId });
    case 'getPromptTemplate':
      return getPromptTemplate();
    case 'savePromptTemplate':
      return savePromptTemplate(msg.template);
    case 'submitReport':
      return data.saveReport(msg.description, msg.screenshot);
    case 'getLearned':
      return learned.getLearned(msg.profileId, msg.scope);
    case 'saveLearned':
      return learned.saveLearned(msg.profileId, msg.scope, msg.label, msg.entry);
    case 'learnedUsed':
      return learned.learnedUsed(msg.profileId, msg.scope, msg.labels);
    case 'updateLearned':
      return learned.updateLearned(msg.profileId, msg.scope, msg.key, msg.value);
    case 'deleteLearned':
      return learned.deleteLearned(msg.profileId, msg.scope, msg.key);
    case 'clearLearned':
      return learned.clearLearned(msg.profileId);
    case 'listLearned':
      return learned.listLearned();
    case 'jobSeen':
      return tabId === undefined ? null : tracker.jobSeen(tabId, msg.info);
    case 'trackFilled':
      return tabId === undefined ? null : tracker.trackFilled(tabId, msg.info).then(() => null);
    case 'trackSubmitted':
      return tabId === undefined ? null : tracker.trackSubmitted(tabId, msg.info, msg.armed, sender.tab?.title).then(() => null);
    case 'flushQueue':
      return flushQueue().then(async (r) => ({ ...r, pending: await pendingCount() }));
    default:
      return null;
  }
}

chrome.runtime.onMessage.addListener((msg: Message, sender, sendResponse: (r: MessageResponse) => void) => {
  handle(msg, sender).then(
    (data) => sendResponse({ success: true, data }),
    (e: unknown) => sendResponse({ success: false, error: e instanceof Error ? e.message : String(e) }),
  );
  return true; // keep the channel open for the async response
});
