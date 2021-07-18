import pprint
import glob
pp = pprint.PrettyPrinter(indent=4)
from datetime import date, timedelta
import numpy as np
import pandas as pd
import io
import requests
import sys
import time
import os
import re
import tqdm
from nsepy import get_history

# Change directory to packages/core/
path = f"./packages/core"
os.chdir(path)

# Global Variables
path_to_indices = f"./resources/indices_full.csv"
path_to_data = f"./resources/data/"
cols_for_db = ['Close', 'VWAP', 'Volume', 'Turnover', 'Trades', 'Deliverable Volume', '%Deliverble']

start_date = date(2018, 7, 10)
end_date = date.today()

def download_data(tickr, start_date, end_date):
    data = get_history(tickr, start_date, end_date)
    return data

def get_tickrs(path_to_indices):
    
    list_of_urls = pd.read_csv(path_to_indices).Link.to_list()
    list_of_symbols = []

    for url in list_of_urls:
        s = requests.get(url).content
        df = pd.read_csv(io.StringIO(s.decode('utf-8')))
        list_of_symbols.extend(df.Symbol.to_list())
    
    list_of_symbols = list(set(list_of_symbols))
    list_of_symbols.sort()
    return list_of_symbols

def create_base_df(start_date, end_date):
    base_df = pd.DataFrame(index = get_history("SBIN", start_date, end_date).index)
    return base_df


def store_historical_data(list_of_stocks, cols_for_db, start_date, end_date):
    
    list_of_stocks = ["SBIN", "MINDTREE"]
    
    print(start_date, end_date)

    for symbol in tqdm.tqdm(list_of_stocks):
        symbol_df = get_history(symbol, start_date, end_date)[cols_for_db]
        symbol_df.sort_index(axis = 0, inplace = True)
        symbol_df.to_pickle(path_to_data + "stocks_history/" + symbol + ".pkl")


def check_historical_consistency(path_to_stocks_history):
    
    check = True
    list_of_stock_dfs = glob.glob(path_to_stocks_history + "*")
    today = date.today()
    dayb4yest = today - timedelta(days = 2)
    latest_date = get_history("SBIN", dayb4yest, today).index.max()

    for stock_df in list_of_stock_dfs:
        max_date = pd.read_pickle(stock_df).index.max()
        if max_date != latest_date:
            print("Historical database not updated. Please update database and run again.")
            check = False
            return check
    
    print("The historical database is good to go")
    return check


def update_historical_database(path_to_stocks_history, verbose = False):


    list_of_stock_dfs = glob.glob(path_to_stocks_history + "*")


    today = date.today()
    dayb4yest = today - timedelta(days = 2)
    latest_date = get_history("SBIN", dayb4yest, today).index.max()

    for stock in list_of_stock_dfs:
        name = re.search('(.*).pkl', stock.split("/")[-1]).group(1)
        stock_df = pd.read_pickle(stock)
        cols_for_db = stock_df.columns.to_list()
        max_current_date = stock_df.index.max()
        if max_current_date != latest_date:
            if verbose:
                print("Updating : ", name)
                print("Current latest date : ", max_current_date, "\nLatest available date : ", latest_date) 
            temp_df = get_history(name, max_current_date + timedelta(days = 1), latest_date)[cols_for_db]
            stock_df = stock_df.append(temp_df)
            stock_df.sort_index(axis = 0, inplace = True)
            stock_df.to_pickle(stock)
            if verbose:
                print(name, " : historical data has been updated.")
    
    print("Database has been updated.")


list_of_stocks = pd.read_pickle(path_to_data + "base_df.pkl").Tickr.to_list()
path_to_stocks_history = path_to_data + "stocks_history/"

# def create_consolidated_dfs(path_to_stocks_history, output_location):
#     check_historical_consistency(path_to_stocks_history)


store_historical_data(list_of_stocks, cols_for_db, start_date, end_date - timedelta(days = 4))
check_historical_consistency(path_to_stocks_history)
update_historical_database(path_to_stocks_history, verbose = False)






