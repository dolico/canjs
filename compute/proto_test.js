steal('can/util', 'can/compute/proto_compute.js', 'can/test', 'can/map', function(can) {

	module('can/Compute');
	test('single value compute', function () {
		expect(2);
		var num = new can.Compute(1);
		num.bind('change', function (ev, newVal, oldVal) {
			equal(newVal, 2, 'newVal');
			equal(oldVal, 1, 'oldVal');
		});
		num.set(2);
	});

	test('inner computes values are not bound to', function () {
		var num = new can.Compute(1),
			numBind = num.bind,
			numUnbind = num.unbind;
		var bindCount = 0;
		num.bind = function () {
			bindCount++;
			return numBind.apply(this, arguments);
		};
		num.unbind = function () {
			bindCount--;
			return numUnbind.apply(this, arguments);
		};
		var outer = new can.Compute(function () {
			var inner = new can.Compute(function () {
				return num.get() + 1;
			});
			return 2 * inner.get();
		});
		var handler = function() {};
		outer.bind('change', handler);
		// We do a timeout because we temporarily bind on num so that we can use its cached value.
		stop();
		setTimeout(function () {
			equal(bindCount, 1, 'compute only bound to once');
			start();
		}, 50);
	});

	test('a binding compute does not double read', function () {
		var sourceAge = 30,
			timesComputeIsCalled = 0;
		var age = new can.Compute(function (newVal) {
			timesComputeIsCalled++;
			if (timesComputeIsCalled === 1) {
				ok(true, 'reading age to get value');
			} else if (timesComputeIsCalled === 2) {
				equal(newVal, 31, 'the second time should be an update');
			} else if (timesComputeIsCalled === 3) {
				ok(true, 'called after set to get the value');
			} else {
				ok(false, 'You\'ve called the callback ' + timesComputeIsCalled + ' times');
			}
			if (arguments.length) {
				sourceAge = newVal;
			} else {
				return sourceAge;
			}
		});

		var info = new can.Compute(function () {
			return 'I am ' + age.get();
		});

		var k = function () {};
		info.bind('change', k);
		equal(info.get(), 'I am 30');
		age.set(31);
		equal(info.get(), 'I am 31');
	});

	test('cloning a setter compute (#547)', function () {
		var name = new can.Compute('', function(newVal) {
			return this.txt + newVal;
		});

		var cloned = name.clone({
			txt: '.'
		});

		cloned.set('-');
		equal(cloned.get(), '.-');
	});

	test('compute updated method uses get and old value (#732)', function () {
		expect(9);

		var input = {
			value: 1
		};

		var value = new can.Compute('', {
			get: function () {
				return input.value;
			},
			set: function (newVal) {
				input.value = newVal;
			},
			on: function (update) {
				input.onchange = update;
			},
			off: function () {
				delete input.onchange;
			}
		});

		equal(value.get(), 1, 'original value');
		ok(!input.onchange, 'nothing bound');
		value.set(2);
		equal(value.get(), 2, 'updated value');
		equal(input.value, 2, 'updated input.value');

		value.bind('change', function (ev, newVal, oldVal) {
			equal(newVal, 3, 'newVal');
			equal(oldVal, 2, 'oldVal');
			value.unbind('change', this.Constructor);
		});

		ok(input.onchange, 'binding to onchange');

		input.value = 3;
		input.onchange({});

		ok(!input.onchange, 'removed binding');
		equal(value.get(), 3);
	});

	test('a compute updated by source changes within a batch is part of that batch', function () {
		var computeA = new can.Compute('a');
		var computeB = new can.Compute('b');
		
		var combined1 = new can.Compute(function() {
			return computeA.get() + ' ' + computeB.get();
		});

		var combined2 = new can.Compute(function() {
			return computeA.get() + ' ' + computeB.get();
		});

		var combo = new can.Compute(function() {
			return combined1.get() + ' ' + combined2.get();
		});

		var callbacks = 0;
		combo.bind('change', function(){
			if(callbacks === 0){
				ok(true, 'called change once');
			} else {
				ok(false, 'called change multiple times');
			}
			callbacks++;
		});
		
		can.batch.start();
		computeA.set('A');
		computeB.set('B');
		can.batch.stop();
	});

	test('compute.async can be like a normal getter', function() {
		var first = new can.Compute('Justin'),
			last = new can.Compute('Meyer'),
			fullName = can.Compute.async('', function(){
				return first.get() + ' ' + last.get();
			});

		equal(fullName.get(), 'Justin Meyer');
	});

	test('compute.async operate on single value', function() {
		var a = new can.Compute(1);
		var b = new can.Compute(2);

		var obj = can.Compute.async({}, function(curVal) {
			if(a.get()) {
				curVal.a = a.get();
			} else {
				delete curVal.a;
			}

			if(b.get()) {
				curVal.b = b.get();
			} else {
				delete curVal.b;
			}

			return curVal;
		});

		obj.bind('change', function() {});
		deepEqual(obj.get(), {a: 1, b: 2}, 'object has all properties');

		a.set(0);
		deepEqual(obj.get(), {b: 2}, 'removed a');

		b.set(0);
		deepEqual(obj.get(), {}, 'removed b');
	});

	test('compute.async async changing value', function() {
		var a = new can.Compute(1);
		var b = new can.Compute(2);

		var async = can.Compute.async(undefined, function(curVal, setVal) {
			if(a.get()) {
				setTimeout(function() {
					setVal('a');
				}, 10);
			} else if(b.get()) {
				setTimeout(function() {
					setVal('b');
				}, 10);
			} else {
				return null;
			}
		});

		var changeArgs = [
			{newVal: 'a', oldVal: undefined, run: function() { a.set(0); } },
			{newVal: 'b', oldVal: 'a', run: function() { b.set(0); }},
			{newVal: null, oldVal: 'b', run: function() { start(); }}
		],
		changeNum = 0;

		stop();

		async.bind('change', function(ev, newVal, oldVal) {
			var data = changeArgs[changeNum++];
			equal( newVal, data.newVal, 'newVal is correct' );
			equal( oldVal, data.oldVal, 'oldVal is correct' );

			setTimeout(data.run, 10);
		});
	});

	test('can.Construct derived classes should be considered objects, not functions (#450)', function() {
		var foostructor = can.Map({ text: 'bar' }, {}),
			obj = {
				next_level: {
					thing: foostructor,
					text: 'In the inner context'
				}
			},
			read;
		foostructor.self = foostructor;

		read = can.Compute.read(obj, ['next_level','thing','self','text']);
		equal(read.value, 'bar', 'static properties on a can.Construct-based function');

		read = can.Compute.read(obj, ['next_level','thing','self'], { isArgument: true });
		ok(read.value === foostructor, 'arguments shouldn\'t be executed');

		foostructor.self = function() { return foostructor; };
		read = can.Compute.read(obj, ['next_level','thing','self','text'], { executeAnonymousFunctions: true });
		equal(read.value, 'bar', 'anonymous functions in the middle of a read should be executed if requested');
	});

	test('compute.async read without binding', function() {
		var source = new can.Compute(1);

		var async = can.Compute.async([],function( curVal, setVal ) {
			curVal.push(source.get());
			return curVal;
		});

		ok(async.get(), 'calling async worked');
	});

	test('compute.async setting does not force a read', function() {
		expect(0);
		var source = new can.Compute(1);

		var async = can.Compute.async([],function( curVal, setVal ) {
			ok(false);
			curVal.push(source.get());
			return curVal;
		});

		async.set([]);
	});

	test('compute.read works with a Map wrapped in a compute', function() {
		var parent = new can.Compute(new can.Map({map: {first: 'Justin' }}));
		var reads = ['map', 'first'];

		var result = can.Compute.read(parent, reads);
		equal(result.value, 'Justin', 'The correct value is found.');
	});

});