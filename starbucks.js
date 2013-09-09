var qs = lib.querystring;
var geo = lib.geo;

var query = {
	radius: 100,
	limit: 50,
	offset: 0,
	brandCode: 'SBUX',
	latLng: null,
	ignore: 'storeNumber,ownershipTypeCode,timeZoneInfo,extendedHours,hoursNext7Days',
	apikey: '7b35m595vccu6spuuzu2rjh4'
};


function url(position, offset){
	query.offset = offset || 0;
	query.latLng = position.toLatLng().join();
	return "https://openapi.starbucks.com/location/v1/stores?" + qs.stringify(query);
}

var options = {
	max:{
		meters: (100).toMeters(),
		results: 50
	}
};

module.exports = new lib.PostalCrawler("starbucks", options, next);

function next(postal){
	var crawler = this;
	this.json.get(url(postal), process);
	function process(err, res, done){
		if(err){
			debug(err);
		}
		res.json.items.forEach(function(item){
			var store = item.store;
			store.should.have.property("brandName", "Starbucks");

			var vanity = "";
			var addr = store.address;
			crawler.save({
				"name": store.name,
				"storeid": store.id,
				"vanity": lib.vantify(addr.city +"-"+ addr.countrySubdivisionCode +"-"+ store.id),
				"address": {
					"areas": [ addr.countrySubdivisionCode, addr.city, addr.streetAddressLine1 ],
					"postal": addr.postalCode,
					"country": addr.countryCode
				},
				"distance": item.distance.toMeters(),
				"phone": store.phoneNumber && store.phoneNumber.replace(/\D/g, ''),
				"hours": hours(store.regularHours, "http://www.starbucks.com/store/"+store.id),
				"website": "http://www.starbucks.com/store/"+store.id,
				"coordinates": new geo.Position(store.coordinates.latitude, store.coordinates.longitude)
			});
		});

		var paging = res.json.paging;
		var end = paging.offset+paging.returned;
		if(end < paging.total){
			debug("paging offset="+end);
			crawler.json.get(url(postal, end), process);
		}
		else {
			done();
		}
	}
};

var days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
function hours(data, website){
	//sometimes we get "regularHours": null
	//...no idea what that's all about
	if(!data) {
		debug("no store hours: " + website);
		return "Closed";
	}
	//there may be `open24x7:true` in the data which seems to
	// signify that the location has "24hr Amenities" there.
	// Regardless, the website always lists the times- so that's what we do.
	var out = [];
	days.forEach(function(day){
		var d = data[day];
		if(!d.open) return;
		out.push(day + to12hr(d.openTime) + "-" + to12hr(d.closeTime));
	});
	return out.join('\n');
}

function to12hr(time){
	time = time.split(':');
	return new lib.Time24(+time[0], +time[1]).toTime12();
}