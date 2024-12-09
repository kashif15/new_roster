$(function () {
    // Initialize the datepicker with today's date
    $("#datepicker").datepicker({ 
        autoclose: true, 
        todayHighlight: true
    }).datepicker('update', new Date());

    // Global variable to store all employees data
    var allEmployees = [];

    // Function to fetch employees for a given date
    function fetchEmployeesForDate(date) {
        $.ajax({
            url: `/onshift?shiftDate=${date}`,
            method: 'GET',
            success: function(response) {
                allEmployees = response;
                resetFilter();
                renderEmployees(allEmployees);
            },
            error: function(err) {
                console.error('Error fetching shift data:', err);
                allEmployees = [];
                const teamContainer = $('#teamContainer');
                teamContainer.empty();
                teamContainer.append('<p>No employees on shift for this date.</p>');
            }
        });
    }

    // Function to render employees
    function renderEmployees(employees) {
        const teamContainer = $('#teamContainer');
        teamContainer.empty();

        if (employees.length > 0) {
            employees.forEach(employee => {
                teamContainer.append(`
                    <div class="team-member" onclick="window.location.href='/profile/${employee.employeeId}'">
                        <div class="member-photo">
                            ${employee.image ? `<img src="${employee.image}" alt="${employee.name}">` : ''}
                        </div>
                        <h3>${employee.name}</h3>
                        <p>${employee.shift}</p>
                    </div>
                `);
            });
        } else {
            teamContainer.append('<p>No employees on shift for this date.</p>');
        }
    }

    // Fetch employees for today's date on page load
    const today = new Date();
    const year = today.getFullYear();
    let month = (today.getMonth() + 1).toString();
    let day = today.getDate().toString();

    month = parseInt(month, 10);
    day = parseInt(day, 10);

    const formattedToday = `${year}-${month}-${day}`;
    fetchEmployeesForDate(formattedToday);

    // Event handler for when the date changes
    $('#datepicker').on('changeDate', function() {
        const selectedDate = $('#selectedDate').val();
        let [year, month, day] = selectedDate.split('-');
        month = parseInt(month, 10);
        day = parseInt(day, 10);
        const formattedDate = `${year}-${month}-${day}`;
        fetchEmployeesForDate(formattedDate);
    });

    // Event handler for filter buttons
    $(document).on('click', '.filter-btn', function() {
        const selectedShift = $(this).attr('data-shift');
        $('.filter-btn').removeClass('btn-primary').addClass('btn-outline-primary');
        $(this).removeClass('btn-outline-primary').addClass('btn-primary');

        if (allEmployees.length === 0) {
            renderEmployees(allEmployees); 
            return;
        }

        if (selectedShift === 'All') {
            renderEmployees(allEmployees);
        } else {
            const filteredEmployees = allEmployees.filter(employee => employee.shift === selectedShift);
            renderEmployees(filteredEmployees);
        }
    });

    // Function to reset the filter to 'All'
    function resetFilter() {
        $('.filter-btn').removeClass('btn-primary').addClass('btn-outline-primary');
        $('.filter-btn[data-shift="All"]').removeClass('btn-outline-primary').addClass('btn-primary');
    }

    $('#uploadFile').on('change', function() {
        const file = this.files[0];
        const validExcelTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        
        if (file && !validExcelTypes.includes(file.type)) {
            showError('Please upload a valid Excel file (.xls or .xlsx)');
            this.value = ''; // Clear the file input
            return false;
        }
    });

    // Form submission handler for Excel upload
    $('form[action="/upload"]').on('submit', function(e) {
        e.preventDefault();
        
        const formData = new FormData(this);
        
        $.ajax({
            url: '/upload',
            type: 'POST',
            data: formData,
            processData: false,
            contentType: false,
            success: function(response) {
                window.location.href = '/';
            },
            error: function(xhr) {
                let errorMessage = 'An error occurred while uploading the file';
                if (xhr.responseJSON && xhr.responseJSON.error) {
                    errorMessage = xhr.responseJSON.error;
                }
                showError(errorMessage);
            }
        });
    });

    // Image upload validation and handling
    $('input[type="file"][accept="image/*"]').on('change', function() {
        const file = this.files[0];
        const validImageTypes = ['image/jpeg', 'image/png', 'image/gif'];
        
        if (file && !validImageTypes.includes(file.type)) {
            showError('Please upload a valid image file (JPEG, PNG, or GIF)');
            this.value = ''; // Clear the file input
            return false;
        }
    });

    function showError(message) {
        $('#errorMessage').text(message);
        $('#errorModal').modal('show');
    }

    // Add this to your existing JavaScript
$('#updateForm').on('submit', function(e) {
    e.preventDefault();
    
    const formData = new FormData(this);
    
    $.ajax({
        url: $(this).attr('action'),
        type: 'POST',
        data: formData,
        processData: false,
        contentType: false,
        success: function(response) {
            if (response.redirect) {
                window.location.href = response.redirect;
            } else if (response.success) {
                location.reload();
            }
        },
        error: function(xhr) {
            const response = xhr.responseJSON;
            showError(response.error || 'An error occurred while updating the profile');
        }
    });
});
    
    
});
