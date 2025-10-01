class AdminDashboard {
    constructor() {
        this.applications = [];
        this.teachers = new Set();
        this.filteredApplications = [];

        // Firebase 초기화
        this.initFirebase();

        // 데이터 로드
        this.loadData();

        // 필터 이벤트 설정
        this.setupFilters();

        // 5분마다 자동 새로고침
        setInterval(() => this.loadData(), 5 * 60 * 1000);
    }

    initFirebase() {
        // Firebase 설정 (실제 사용시 설정 필요)
        try {
            const firebaseConfig = {
                // 실제 Firebase 설정이 필요함
            };

            // Firebase 초기화 (설정 완료 후 주석 해제)
            // if (!firebase.apps.length) {
            //     firebase.initializeApp(firebaseConfig);
            // }
            // this.database = firebase.database();
            // this.setupRealtimeSync();

            console.log('Firebase 연동 준비 완료');
            this.firebaseEnabled = false;
        } catch (error) {
            console.warn('Firebase 초기화 실패:', error);
            this.firebaseEnabled = false;
        }
    }

    setupRealtimeSync() {
        if (!this.firebaseEnabled || !this.database) return;

        // 실시간 데이터 동기화
        const applicationsRef = this.database.ref('applications');
        applicationsRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.applications = Object.values(data);
                this.processData();
                this.renderDashboard();
            }
        });
    }

    loadData() {
        // 로컬 스토리지에서 데이터 로드
        const savedApplications = localStorage.getItem('vacation-duty-applications');
        if (savedApplications) {
            this.applications = JSON.parse(savedApplications);
        }

        this.processData();
        this.renderDashboard();
        this.updateLastUpdated();
    }

    processData() {
        // 교사 목록 업데이트
        this.teachers.clear();
        this.applications.forEach(app => {
            if (app.teacherName) {
                this.teachers.add(app.teacherName);
            }
        });

        // 필터링 적용
        this.applyFilters();
    }

    setupFilters() {
        const teacherFilter = document.getElementById('teacher-filter');
        const statusFilter = document.getElementById('status-filter');
        const typeFilter = document.getElementById('type-filter');

        [teacherFilter, statusFilter, typeFilter].forEach(filter => {
            filter.addEventListener('input', () => this.applyFilters());
            filter.addEventListener('change', () => this.applyFilters());
        });
    }

    applyFilters() {
        const teacherFilter = document.getElementById('teacher-filter').value.toLowerCase();
        const statusFilter = document.getElementById('status-filter').value;
        const typeFilter = document.getElementById('type-filter').value;

        this.filteredApplications = this.applications.filter(app => {
            const matchesTeacher = !teacherFilter ||
                (app.teacherName && app.teacherName.toLowerCase().includes(teacherFilter));
            const matchesStatus = !statusFilter || app.status === statusFilter;
            const matchesType = !typeFilter || app.type === typeFilter;

            return matchesTeacher && matchesStatus && matchesType;
        });

        this.renderApplicationsList();
    }

    renderDashboard() {
        this.renderStatistics();
        this.renderApplicationsList();
        this.renderCalendarOverview();
        this.renderTypeStatistics();
    }

    renderStatistics() {
        const totalApps = this.applications.length;
        const pendingApps = this.applications.filter(app => app.status === 'pending').length;
        const approvedApps = this.applications.filter(app => app.status === 'approved').length;
        const totalTeachers = this.teachers.size;
        const totalDays = this.applications.reduce((sum, app) => sum + (app.dates ? app.dates.length : 0), 0);

        document.getElementById('total-applications').textContent = totalApps;
        document.getElementById('pending-applications').textContent = pendingApps;
        document.getElementById('approved-applications').textContent = approvedApps;
        document.getElementById('total-teachers').textContent = totalTeachers;
        document.getElementById('total-days').textContent = totalDays;
    }

    renderApplicationsList() {
        const container = document.getElementById('applications-list');

        if (this.filteredApplications.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">조건에 맞는 신청이 없습니다.</p>';
            return;
        }

        // 최신순으로 정렬
        const sortedApps = [...this.filteredApplications].sort((a, b) =>
            new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
        );

        container.innerHTML = sortedApps.map(app => this.createApplicationItem(app)).join('');
    }

    createApplicationItem(app) {
        const statusClass = `application-${app.status || 'pending'}`;
        const statusText = this.getStatusText(app.status);
        const typeText = this.getDutyTypeName(app.type);

        const startDate = app.dates && app.dates.length > 0 ? app.dates[0] : '';
        const endDate = app.dates && app.dates.length > 0 ? app.dates[app.dates.length - 1] : '';
        const dayCount = app.dates ? app.dates.length : 0;

        return `
            <div class="application-item ${statusClass}">
                <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                    <div>
                        <div style="font-weight: bold; font-size: 16px; margin-bottom: 5px;">
                            ${app.teacherName || '이름 없음'} - ${typeText}
                        </div>
                        <div style="color: #666; font-size: 14px;">
                            📅 ${startDate} ~ ${endDate} (${dayCount}일)
                        </div>
                        <div style="color: #666; font-size: 13px; margin-top: 3px;">
                            📝 ${app.reason || '사유 없음'}
                        </div>
                        ${app.destination ? `<div style="color: #666; font-size: 13px;">📍 ${app.destination}</div>` : ''}
                    </div>
                    <div style="text-align: right;">
                        <div style="font-weight: bold; margin-bottom: 10px; color: ${this.getStatusColor(app.status)};">
                            ${statusText}
                        </div>
                        <div>
                            ${app.status === 'pending' ? this.createActionButtons(app.id) : ''}
                        </div>
                    </div>
                </div>
                <div style="font-size: 12px; color: #999;">
                    신청일: ${app.createdAt ? new Date(app.createdAt).toLocaleString() : '알 수 없음'}
                </div>
            </div>
        `;
    }

    createActionButtons(appId) {
        return `
            <button class="btn btn-success" onclick="adminDashboard.approveApplication(${appId})">
                ✅ 승인
            </button>
            <button class="btn btn-danger" onclick="adminDashboard.rejectApplication(${appId})">
                ❌ 거부
            </button>
            <button class="btn" onclick="adminDashboard.viewDetails(${appId})">
                👁️ 상세
            </button>
        `;
    }

    renderCalendarOverview() {
        const container = document.getElementById('calendar-overview');

        // 날짜별 신청 현황 집계
        const dateStats = {};

        this.applications.forEach(app => {
            if (app.dates && app.status === 'approved') {
                app.dates.forEach(date => {
                    if (!dateStats[date]) {
                        dateStats[date] = [];
                    }
                    dateStats[date].push({
                        teacher: app.teacherName || '이름 없음',
                        type: app.type
                    });
                });
            }
        });

        // 날짜순 정렬
        const sortedDates = Object.keys(dateStats).sort();

        if (sortedDates.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-8">승인된 신청이 없습니다.</p>';
            return;
        }

        container.innerHTML = sortedDates.map(date => {
            const teachers = dateStats[date];
            const teacherCount = teachers.length;
            const typeCount = {};

            teachers.forEach(t => {
                typeCount[t.type] = (typeCount[t.type] || 0) + 1;
            });

            const typeText = Object.entries(typeCount)
                .map(([type, count]) => `${this.getDutyTypeName(type)}(${count})`)
                .join(', ');

            return `
                <div class="date-summary">
                    <div>
                        <div style="font-weight: bold;">${this.formatDate(date)}</div>
                        <div style="font-size: 12px; color: #666;">${typeText}</div>
                    </div>
                    <div class="teacher-count">
                        👥 ${teacherCount}명
                    </div>
                </div>
            `;
        }).join('');
    }

    renderTypeStatistics() {
        const container = document.getElementById('type-statistics');

        const typeStats = {};
        this.applications.forEach(app => {
            const type = app.type || 'unknown';
            if (!typeStats[type]) {
                typeStats[type] = { total: 0, pending: 0, approved: 0, rejected: 0, days: 0 };
            }

            typeStats[type].total++;
            typeStats[type][app.status || 'pending']++;
            typeStats[type].days += app.dates ? app.dates.length : 0;
        });

        container.innerHTML = Object.entries(typeStats).map(([type, stats]) => `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 10px;">
                <div style="font-weight: bold; margin-bottom: 8px;">
                    ${this.getDutyTypeName(type)} (총 ${stats.total}건, ${stats.days}일)
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; font-size: 14px;">
                    <div>대기: <strong>${stats.pending}</strong></div>
                    <div style="color: #28a745;">승인: <strong>${stats.approved}</strong></div>
                    <div style="color: #dc3545;">거부: <strong>${stats.rejected}</strong></div>
                </div>
            </div>
        `).join('');
    }

    // 유틸리티 함수들
    getDutyTypeName(type) {
        const types = {
            '41': '41조 연수',
            'business': '출장',
            'vacation': '연가',
            'overseas': '국외연수',
            'unknown': '알 수 없음'
        };
        return types[type] || type;
    }

    getStatusText(status) {
        const statusTexts = {
            'pending': '대기 중',
            'approved': '승인됨',
            'rejected': '거부됨'
        };
        return statusTexts[status] || '알 수 없음';
    }

    getStatusColor(status) {
        const colors = {
            'pending': '#ffc107',
            'approved': '#28a745',
            'rejected': '#dc3545'
        };
        return colors[status] || '#6c757d';
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
        return `${month}월 ${day}일 (${dayOfWeek})`;
    }

    updateLastUpdated() {
        const now = new Date();
        document.getElementById('last-updated').textContent =
            `마지막 업데이트: ${now.toLocaleString()}`;
    }

    // 액션 함수들
    approveApplication(id) {
        if (confirm('이 신청을 승인하시겠습니까?')) {
            this.updateApplicationStatus(id, 'approved');
        }
    }

    rejectApplication(id) {
        const reason = prompt('거부 사유를 입력해주세요:');
        if (reason !== null) {
            this.updateApplicationStatus(id, 'rejected', reason);
        }
    }

    updateApplicationStatus(id, status, reason = null) {
        const app = this.applications.find(a => a.id === id);
        if (app) {
            app.status = status;
            app.reviewedAt = new Date().toISOString();
            if (reason) {
                app.rejectReason = reason;
            }

            // 로컬 스토리지 업데이트
            localStorage.setItem('vacation-duty-applications', JSON.stringify(this.applications));

            // Firebase 업데이트 (활성화된 경우)
            if (this.firebaseEnabled && this.database) {
                this.database.ref(`applications/${id}`).update({
                    status: status,
                    reviewedAt: app.reviewedAt,
                    ...(reason && { rejectReason: reason })
                });
            }

            this.processData();
            this.renderDashboard();

            const statusText = this.getStatusText(status);
            alert(`신청이 ${statusText}되었습니다.`);
        }
    }

    viewDetails(id) {
        const app = this.applications.find(a => a.id === id);
        if (app) {
            const details = `
신청자: ${app.teacherName || '이름 없음'}
과목: ${app.teacherSubject || '과목 없음'}
유형: ${this.getDutyTypeName(app.type)}
기간: ${app.dates ? app.dates[0] : ''} ~ ${app.dates ? app.dates[app.dates.length - 1] : ''} (${app.dates ? app.dates.length : 0}일)
사유: ${app.reason || '사유 없음'}
목적지: ${app.destination || '목적지 없음'}
신청일: ${app.createdAt ? new Date(app.createdAt).toLocaleString() : '알 수 없음'}
상태: ${this.getStatusText(app.status)}
${app.rejectReason ? `거부 사유: ${app.rejectReason}` : ''}
            `;
            alert(details);
        }
    }

    approveAllPending() {
        const pendingApps = this.applications.filter(app => app.status === 'pending');

        if (pendingApps.length === 0) {
            alert('승인할 대기 중인 신청이 없습니다.');
            return;
        }

        if (confirm(`${pendingApps.length}건의 대기 중인 신청을 모두 승인하시겠습니까?`)) {
            pendingApps.forEach(app => {
                app.status = 'approved';
                app.reviewedAt = new Date().toISOString();
            });

            localStorage.setItem('vacation-duty-applications', JSON.stringify(this.applications));
            this.processData();
            this.renderDashboard();

            alert(`${pendingApps.length}건의 신청이 승인되었습니다.`);
        }
    }

    exportToExcel() {
        // 간단한 CSV 형태로 내보내기
        const headers = ['신청자', '과목', '유형', '시작일', '종료일', '일수', '사유', '목적지', '상태', '신청일'];
        const rows = this.applications.map(app => [
            app.teacherName || '',
            app.teacherSubject || '',
            this.getDutyTypeName(app.type),
            app.dates ? app.dates[0] : '',
            app.dates ? app.dates[app.dates.length - 1] : '',
            app.dates ? app.dates.length : 0,
            app.reason || '',
            app.destination || '',
            this.getStatusText(app.status),
            app.createdAt ? new Date(app.createdAt).toLocaleDateString() : ''
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${cell}"`).join(','))
            .join('\n');

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `방학복무신청_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    }

    showBulkActions() {
        const actions = `
사용 가능한 일괄 작업:
1. 전체 승인 - 모든 대기 중인 신청을 승인
2. 엑셀 내보내기 - 모든 신청 데이터를 CSV 파일로 내보내기
3. 데이터 새로고침 - 최신 데이터로 업데이트

더 많은 기능이 필요하시면 시스템 관리자에게 문의하세요.
        `;
        alert(actions);
    }
}

// 전역 인스턴스 생성
let adminDashboard;

// 페이지 로드 시 초기화
window.addEventListener('load', () => {
    adminDashboard = new AdminDashboard();
});

// 전역 함수들
function refreshData() {
    adminDashboard.loadData();
    alert('데이터가 새로고침되었습니다.');
}

function approveAllPending() {
    adminDashboard.approveAllPending();
}

function exportToExcel() {
    adminDashboard.exportToExcel();
}

function showBulkActions() {
    adminDashboard.showBulkActions();
}