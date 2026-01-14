# Schedule Management System

A simple and efficient schedule management application for organizing events and tasks.

## Features

- **Add Events**: Create new events with title, date, time, and description
- **List Events**: View all events or filter by specific date
- **Update Events**: Modify existing event details
- **Delete Events**: Remove events from your schedule
- **Data Persistence**: All events are automatically saved to a JSON file
- **Command-line Interface**: Easy-to-use CLI for managing your schedule

## Installation

No additional dependencies required! Just Python 3.6 or higher.

```bash
git clone https://github.com/mranii-cmd/Shedule.git
cd Shedule
```

## Usage

### Command Line Interface

The schedule system provides a command-line interface for easy interaction:

#### Add an Event
```bash
python schedule_cli.py add "Team Meeting" 2026-01-15 14:30 "Discuss project updates"
```

#### List All Events
```bash
python schedule_cli.py list
```

#### List Events for a Specific Date
```bash
python schedule_cli.py list 2026-01-15
```

#### Show Event Details
```bash
python schedule_cli.py show 1
```

#### Update an Event
```bash
python schedule_cli.py update 1 --title "Updated Meeting" --time 15:00
```

#### Delete an Event
```bash
python schedule_cli.py delete 1
```

#### Show Help
```bash
python schedule_cli.py help
```

### Programmatic Usage

You can also use the schedule module in your Python code:

```python
from schedule import Event, ScheduleManager

# Initialize the manager
manager = ScheduleManager()

# Add an event
event = Event("Meeting", "2026-01-15", "14:00", "Important meeting")
manager.add_event(event)

# List all events
events = manager.list_events()
for event in events:
    print(event)

# Update an event
manager.update_event(1, time="15:00")

# Delete an event
manager.delete_event(1)
```

See `example.py` for more detailed usage examples.

## Project Structure

```
Shedule/
├── schedule.py          # Core schedule management module
├── schedule_cli.py      # Command-line interface
├── example.py           # Example usage script
├── README.md            # This file
└── .gitignore          # Git ignore rules
```

## Date and Time Formats

- **Date**: YYYY-MM-DD (e.g., 2026-01-15)
- **Time**: HH:MM (e.g., 14:30)

## Data Storage

Events are stored in `schedule_data.json` by default. This file is automatically created and updated when you add, modify, or delete events.

## Example

Run the example script to see the schedule system in action:

```bash
python example.py
```

## License

This project is open source and available for use and modification.

## Contributing

Contributions are welcome! Feel free to submit issues or pull requests.
