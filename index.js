const request = require("request");
const notifier = require("node-notifier");
const NotificationCenter = require("node-notifier").NotificationCenter;
const flatMap = require("array.prototype.flatmap");
const replaceAll = require("string.prototype.replaceall");

flatMap.shim();
replaceAll.shim();

const { COUNTRIES } = require("./constants");
const args = process.argv.slice(2);

let skusForCountry = (countrySkuCode) => {
  return {
	// [`MTV13Z${countrySkuCode}/A`]: "IPhone 15 Pro 	256		Titanium Black",
    // [`MTUX3Z${countrySkuCode}/A`]: "IPhone 15 Pro 	128		Titanium Natural",
    [`MTV53Z${countrySkuCode}/A`]: "IPhone 15 Pro 	256		Titanium Natural",	
    // [`MTV93Z${countrySkuCode}/A`]: "IPhone 15 Pro 	512		Titanium Natural",
    // [`MTV63Z${countrySkuCode}/A`]: "IPhone 15 Pro	256		Titanium Blue",
    //[`MTVA3Z${countrySkuCode}/A`]: "IPhone 15 Pro	512		Titanium Blue",
    // [`MU7A3Z${countrySkuCode}/A`]: "IPhone 15 ProMax	256		Titanium Blue",
  };
};

let favouritesForCountry = (countrySkuCode) => {
  return [`MTV63Z${countrySkuCode}/A`];
};

const control = "MTVA3ZD/A";
let storeNumber = "R172";
let searchNearbyStores = true;
let state = "CO";
let country = "US";

if (args.length > 0) {
  const passedStore = args[0];
  country = (args[1] ? args[1] : "US").toUpperCase();
  searchNearbyStores = args[2];
  if (passedStore.charAt(0) === "R") {
    // All retail store numbers start with R
    storeNumber = passedStore;
    state = null;
  }
}

const countryConfig = COUNTRIES[country];

let storePath = countryConfig["storePath"];
let skuList = skusForCountry(countryConfig["skuCode"]);
let favorites = favouritesForCountry(countryConfig["skuCode"]);

const query =
  Object.keys(skuList)
    .map((k, i) => `parts.${i}=${encodeURIComponent(k)}`)
    .join("&") + `&searchNearby=${searchNearbyStores}&store=${storeNumber}`;

let options = {
  method: "GET",
  url: `https://www.apple.com${storePath}/shop/fulfillment-messages?` + query,
};

request(options, function (error, response) {
  if (error) throw new Error(error);

  const body = JSON.parse(response.body);
  const storesArray = body.body.content.pickupMessage.stores;
  let skuCounter = {};
  let hasStoreSearchError = false;

  console.log("Inventory");
  console.log("---------");
  const statusArray = storesArray
    .flatMap((store) => {
      if (state && state !== store.state) return null;

      const name = store.storeName;
      let productStatus = [];

      for (const [key, value] of Object.entries(skuList)) {
        const product = store.partsAvailability[key];

        hasStoreSearchError = product.storeSearchEnabled !== true;

        if (key === control && hasStoreSearchError !== true) {
          hasStoreSearchError = product.pickupDisplay !== "available";
        } else {
          productStatus.push(
            `${value.replaceAll("\t", "  ")}: ${product.pickupDisplay}`
          );

          if (product.pickupDisplay === "available") {
            console.log(`${value} in stock at ${store.storeName}`);
            let count = skuCounter[key] ? skuCounter[key] : 0;
            count += 1;
            skuCounter[key] = count;
          }
        }
      }

      return {
        name: name,
        products: productStatus,
      };
    })
    .filter((n) => n);

  let hasError = hasStoreSearchError;

  const inventory = Object.entries(skuCounter)
    .map(([key, value]) => `${skuList[key]}: ${value}`)
    .join(" | ");

  console.log("\nInventory counts");
  console.log("----------------");
  console.log(inventory.replaceAll(" | ", "\n"));
  let hasUltimate = Object.keys(skuCounter).some(
    (r) => favorites.indexOf(r) >= 0
  );
  let notificationMessage;

  if (inventory) {
    notificationMessage = `${
      hasUltimate ? "FOUND ULTIMATE! " : ""
    }Some models found: ${inventory}`;
  } else {
    notificationMessage = "No models found.";
    console.log(statusArray);
    console.log(notificationMessage);
  }

  if (notificationMessage !== "No models found.") {
    const message = hasError
      ? notificationMessage + " Please check for possible errors"
      : notificationMessage;
    notifier.notify({
      title: "Iphone 15 Pro Availability",
      message: message,
      sound: true,
      timeout: false,
    });
  }

  // Log time at end
  console.log(`\nGenerated: ${new Date().toLocaleString()}`);
});
