function load(file) {
	let elm = document.createElement("script");
	elm.src = chrome.runtime.getURL("/" + file);
	document.body.appendChild(elm);
  console.debug(file);
  return;
};

load("data.js");
load("calc.js");
load("index.js");
