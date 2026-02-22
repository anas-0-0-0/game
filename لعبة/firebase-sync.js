/**
 * مزامنة الغرف واللعبة عبر Firebase بين الأجهزة
 * عند تعطيل Firebase يتم الاعتماد على localStorage (يعمل فقط على نفس الجهاز/المتصفح)
 */
(function(global) {
    'use strict';

    let db = null;
    let enabled = false;

    function init() {
        if (enabled && db) return true;
        if (typeof FIREBASE_ENABLED !== 'undefined' && !FIREBASE_ENABLED) {
            console.log('[Firebase] غير مفعّل في firebase-config.js');
            return false;
        }
        if (typeof firebase === 'undefined') {
            console.warn('[Firebase] مكتبة Firebase غير محمّلة - تأكد من تحميل firebase-app-compat.js و firebase-database-compat.js');
            return false;
        }
        if (typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.includes('ضع_')) {
            console.warn('[Firebase] إعدادات Firebase غير مكتملة - تحقق من firebase-config.js');
            return false;
        }
        try {
            if (!firebase.apps || firebase.apps.length === 0) {
                firebase.initializeApp(FIREBASE_CONFIG);
            }
            db = firebase.database();
            enabled = true;
            console.log('[Firebase] تم التفعيل بنجاح - المزامنة بين الأجهزة تعمل');
            return true;
        } catch (e) {
            console.error('[Firebase] خطأ في التهيئة:', e);
            enabled = false;
            return false;
        }
    }

    function roomRef(roomCode) {
        if (!db || !roomCode) return null;
        return db.ref('rooms/' + roomCode);
    }

    /** إنشاء غرفة على السيرفر (يستدعيها المعلم) */
    function createRoomOnServer(roomCode) {
        if (!init() || !roomCode) return Promise.resolve(false);
        var ref = roomRef(roomCode);
        return ref.set({
            roomActive: true,
            teacherId: 'teacher_' + Date.now(),
            createdAt: new Date().toISOString(),
            gameStarted: false,
            gameInProgress: false,
            teams: {},
            gameTeams: {},
            studentAnswers: []
        }).then(function() { return true; }).catch(function(err) {
            console.error('[Firebase] createRoom:', err);
            return false;
        });
    }

    /** التحقق من وجود الغرفة ونشاطها (يستدعيها الطالب) */
    function getRoomFromServer(roomCode) {
        if (!roomCode) return Promise.resolve(null);
        if (!init()) {
            console.warn('[Firebase] Firebase غير مفعّل - لا يمكن التحقق من الغرفة');
            return Promise.resolve(null);
        }
        var ref = roomRef(roomCode);
        if (!ref) return Promise.resolve(null);
        return ref.once('value').then(function(snap) {
            var val = snap.val();
            console.log('[Firebase] تم جلب بيانات الغرفة:', val ? 'موجودة' : 'غير موجودة');
            return val;
        }).catch(function(err) {
            console.error('[Firebase] خطأ في جلب الغرفة:', err);
            if (err && err.message && err.message.includes('disabled')) {
                console.error('[Firebase] ⚠️ قاعدة البيانات معطلة! يرجى تفعيل Realtime Database من Firebase Console');
            }
            return null;
        });
    }

    /** إضافة فريق للغرفة على السيرفر */
    function addTeamToRoom(roomCode, teamData) {
        if (!init() || !roomCode || !teamData) return Promise.resolve(false);
        var teamWithScore = {
            id: teamData.id,
            teamName: teamData.teamName,
            leaderName: teamData.leaderName,
            joinedAt: teamData.joinedAt || new Date().toISOString(),
            score: 0,
            hasAnswered: false,
            status: 'waiting'
        };
        var ref = roomRef(roomCode);
        if (!ref) return Promise.resolve(false);
        return ref.child('teams').child(teamData.id).set(teamWithScore).then(function() {
            return true;
        }).catch(function(err) {
            console.error('[Firebase] addTeam error:', err);
            return false;
        });
    }

    /** الاستماع لتحديثات الغرفة (الفرق، حالة اللعبة، إلخ) */
    function onRoomUpdate(roomCode, callback) {
        if (!init() || !roomCode || typeof callback !== 'function') return function() {};
        var ref = roomRef(roomCode);
        var handler = ref.on('value', function(snap) { callback(snap.val()); });
        return function() { ref.off('value', handler); };
    }

    /** تحديث حالة اللعبة على السيرفر (المعلم) */
    function setGameStateOnServer(roomCode, state) {
        if (!init() || !roomCode || !state) return Promise.resolve(false);
        var ref = roomRef(roomCode);
        var updates = {};
        if (state.roomActive !== undefined) updates.roomActive = state.roomActive;
        if (state.gameStarted !== undefined) updates.gameStarted = state.gameStarted;
        if (state.gameInProgress !== undefined) updates.gameInProgress = state.gameInProgress;
        if (state.currentQuestionIndex !== undefined) updates.currentQuestionIndex = state.currentQuestionIndex;
        if (state.questionStartTime !== undefined) updates.questionStartTime = state.questionStartTime;
        if (state.showCorrectAnswer !== undefined) updates.showCorrectAnswer = state.showCorrectAnswer;
        if (state.correctAnswerIndex !== undefined) updates.correctAnswerIndex = state.correctAnswerIndex;
        if (state.currentQuestions !== undefined) updates.currentQuestions = state.currentQuestions;
        if (state.gameTeams !== undefined) updates.gameTeams = state.gameTeams;
        return ref.update(updates).then(function() { return true; }).catch(function(err) {
            console.error('[Firebase] setGameState:', err);
            return false;
        });
    }

    /** إشارة انتهاء وقت السؤال (الطالب يرسلها عند انتهاء 30 ثانية لتفعيل الانتقال التلقائي عند المعلم) */
    function setTimeUpOnServer(roomCode, questionIndex) {
        if (!init() || !roomCode) return Promise.resolve(false);
        return roomRef(roomCode).update({
            timeUp: { questionIndex: questionIndex, at: Date.now() }
        }).then(function() { return true; }).catch(function(err) {
            console.error('[Firebase] setTimeUp:', err);
            return false;
        });
    }

    /** مسح إشارة انتهاء الوقت بعد معالجتها */
    function clearTimeUpOnServer(roomCode) {
        if (!init() || !roomCode) return Promise.resolve(false);
        return roomRef(roomCode).child('timeUp').remove().then(function() { return true; }).catch(function() { return false; });
    }

    /** جلب إجابات الطلاب من السيرفر */
    function getStudentAnswersFromServer(roomCode) {
        if (!init() || !roomCode) return Promise.resolve([]);
        var ref = roomRef(roomCode);
        if (!ref) return Promise.resolve([]);
        return ref.child('studentAnswers').once('value').then(function(snap) {
            var val = snap.val();
            if (!val) return [];
            // Firebase يخزن كـ object with keys
            var arr = Object.keys(val).map(function(k) { return val[k]; });
            return Array.isArray(arr) ? arr : [];
        }).catch(function(err) {
            console.error('[Firebase] getStudentAnswers:', err);
            return [];
        });
    }

    /** إضافة إجابة طالب على السيرفر */
    function pushStudentAnswerOnServer(roomCode, answerData) {
        if (!init() || !roomCode || !answerData) return Promise.resolve(false);
        return roomRef(roomCode).child('studentAnswers').push(answerData).then(function() { return true; }).catch(function(err) {
            console.error('[Firebase] pushStudentAnswer:', err);
            return false;
        });
    }

    /** جلب الفرق من السيرفر */
    function getTeamsFromServer(roomCode) {
        if (!init() || !roomCode) return Promise.resolve([]);
        return roomRef(roomCode).child('teams').once('value').then(function(snap) {
            var val = snap.val();
            if (!val) return [];
            return Object.keys(val).map(function(k) { return val[k]; });
        }).catch(function() { return []; });
    }

    /** تحديث gameTeams على السيرفر (بعد تصحيح الإجابات) */
    function setGameTeamsOnServer(roomCode, gameTeams) {
        if (!init() || !roomCode) return Promise.resolve(false);
        var teamsObj = {};
        if (Array.isArray(gameTeams)) {
            gameTeams.forEach(function(team) {
                if (team && team.id) teamsObj[team.id] = team;
            });
        } else if (typeof gameTeams === 'object' && gameTeams !== null) {
            teamsObj = gameTeams;
        }
        return roomRef(roomCode).update({ gameTeams: teamsObj }).then(function() { return true; }).catch(function(err) {
            console.error('[Firebase] setGameTeams:', err);
            return false;
        });
    }

    /** حفظ جلسة نتائج (أرشفة) داخل الغرفة بحيث تظهر للجميع */
    function saveResultsSessionOnServer(roomCode, session) {
        if (!init() || !roomCode || !session) return Promise.resolve(false);
        var ref = roomRef(roomCode);
        if (!ref) return Promise.resolve(false);
        var id = session.id || ('session_' + Date.now());
        var payload = {
            id: id,
            createdAt: session.createdAt || new Date().toISOString(),
            roomCode: session.roomCode || roomCode,
            teams: session.teams || []
        };
        return ref.child('resultsHistory').child(id).set(payload).then(function() {
            return true;
        }).catch(function(err) {
            console.error('[Firebase] saveResultsSession:', err);
            return false;
        });
    }

    /** جلب أرشيف النتائج من السيرفر */
    function getResultsHistoryFromServer(roomCode, limit) {
        if (!init() || !roomCode) return Promise.resolve([]);
        var ref = roomRef(roomCode);
        if (!ref) return Promise.resolve([]);
        var q = ref.child('resultsHistory').orderByChild('createdAt');
        if (typeof limit === 'number' && isFinite(limit) && limit > 0) {
            q = q.limitToLast(limit);
        }
        return q.once('value').then(function(snap) {
            var val = snap.val();
            if (!val) return [];
            var arr = Object.keys(val).map(function(k) { return val[k]; });
            arr.sort(function(a, b) {
                var at = Date.parse(a && a.createdAt ? a.createdAt : '') || 0;
                var bt = Date.parse(b && b.createdAt ? b.createdAt : '') || 0;
                return bt - at;
            });
            return arr;
        }).catch(function(err) {
            console.error('[Firebase] getResultsHistory:', err);
            return [];
        });
    }

    function isEnabled() {
        if (!enabled) init();
        return enabled;
    }

    global.FirebaseSync = {
        init: init,
        isEnabled: isEnabled,
        createRoomOnServer: createRoomOnServer,
        getRoomFromServer: getRoomFromServer,
        addTeamToRoom: addTeamToRoom,
        onRoomUpdate: onRoomUpdate,
        setGameStateOnServer: setGameStateOnServer,
        setTimeUpOnServer: setTimeUpOnServer,
        clearTimeUpOnServer: clearTimeUpOnServer,
        pushStudentAnswerOnServer: pushStudentAnswerOnServer,
        getTeamsFromServer: getTeamsFromServer,
        setGameTeamsOnServer: setGameTeamsOnServer,
        saveResultsSessionOnServer: saveResultsSessionOnServer,
        getResultsHistoryFromServer: getResultsHistoryFromServer,
        getStudentAnswersFromServer: getStudentAnswersFromServer
    };
})(typeof window !== 'undefined' ? window : this);
