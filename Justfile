run:
    python main.py

db:
    mongod --dbpath db/ --bind_ip 127.0.0.1 --port 27017

deploy:
    ssh root@saegl.me deploy-machineplay
